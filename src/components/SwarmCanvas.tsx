import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { createForceLayout, runLayoutSimulation, type SimLink } from '../lib/swarmLayout.ts'
import {
  createSwarmStore,
  edgeKey,
  buildReplaySnapshot,
  DEFAULT_STAGE_ORDER,
  type AgentName,
  type AgentStatus,
} from '../lib/swarmStore.ts'
import { replayState, stopReplay, togglePlay, stepForward, stepBack, setSpeed } from '../lib/replayStore.ts'
import type { AuditBlock } from '../lib/auditStore.ts'
import RnAvatar from './RnAvatar.tsx'

const WIDTH = 480
const HEIGHT = 220
const LAYOUT_MARGIN = 60

/**
 * Known stage names get friendly copy; anything else (a dynamically
 * dispatched domain agent like "AI Sport" — see domainAgents.ts) falls back
 * to a generic label built from its own name, so the canvas never needs to
 * know the full registry of possible agents ahead of time.
 */
const ROLE_LABEL: Record<string, string> = {
  Planner: 'Task decomposition',
  Architect: 'System design',
  'Lead Dev': 'Implementation',
  Reviewer: 'QA & sign-off',
  PO: 'Discovery review',
  Policy: 'Governance check',
}

/** Pass A: the "micro-status badge" shown under a node while it's active/thinking. */
const MICRO_STATUS: Record<string, string> = {
  Planner: 'Decomposing task graph...',
  Architect: 'Compiling blueprint...',
  'Lead Dev': 'Synthesizing UI...',
  Reviewer: 'Reviewing for correctness...',
  PO: 'Reviewing discovery interview...',
  Policy: 'Evaluating governance rules...',
}

function roleFor(agent: string): string {
  return ROLE_LABEL[agent] ?? 'Domain specialist'
}

function microStatusFor(agent: string): string {
  return MICRO_STATUS[agent] ?? `Modeling ${agent} schema...`
}

const STATUS_STROKE: Record<AgentStatus, string> = {
  idle: 'stroke-border',
  active: 'stroke-accent',
  thinking: 'stroke-accent-glow',
  completed: 'stroke-emerald-400',
  error: 'stroke-red-400',
}

// Tailwind arbitrary-value classes rather than inline `style` — production's
// CSP (style-src 'self', no unsafe-inline) silently drops inline style
// attributes, which is why this had never actually rendered in production.
const STATUS_GLOW_CLASS: Record<AgentStatus, string> = {
  idle: '',
  active: 'drop-shadow-[0_0_6px_var(--color-accent-glow)]',
  thinking: 'drop-shadow-[0_0_6px_var(--color-accent-glow)]',
  completed: 'drop-shadow-[0_0_4px_rgba(52,211,153,0.6)]',
  error: 'drop-shadow-[0_0_6px_rgba(248,113,113,0.7)]',
}

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }, radius: number): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  return `M${from.x + ux * radius},${from.y + uy * radius} L${to.x - ux * radius},${to.y - uy * radius}`
}

function feedbackArc(from: { x: number; y: number }, to: { x: number; y: number }, radius: number): string {
  return `M${from.x},${from.y + radius} C ${from.x},${from.y + 90} ${to.x},${to.y + 90} ${to.x},${to.y + radius}`
}

/** Evenly spaces `order.length` anchors across the canvas width — replaces the old fixed 4-slot ANCHOR_POSITIONS now that the node count varies per run. */
function computeAnchors(order: AgentName[]): Record<AgentName, { x: number; y: number }> {
  const anchors: Record<AgentName, { x: number; y: number }> = {}
  const usableWidth = WIDTH - LAYOUT_MARGIN * 2
  const n = order.length
  order.forEach((agent, i) => {
    const x = n <= 1 ? WIDTH / 2 : LAYOUT_MARGIN + (usableWidth * i) / (n - 1)
    anchors[agent] = { x, y: HEIGHT / 2 }
  })
  return anchors
}

export default function SwarmCanvas() {
  const swarm = createSwarmStore()

  // Jittered off their anchors so the force simulation has visible work to
  // do settling back into place on first paint — matches the idle default
  // canvas's look before any run has started.
  const initialAnchors = computeAnchors(DEFAULT_STAGE_ORDER)
  const initialPositions: Record<AgentName, { x: number; y: number }> = {}
  for (const agent of DEFAULT_STAGE_ORDER) {
    const anchor = initialAnchors[agent]!
    initialPositions[agent] = { x: anchor.x + (Math.random() - 0.5) * 40, y: anchor.y + (Math.random() - 0.5) * 40 }
  }
  const [positions, setPositions] = createStore<Record<AgentName, { x: number; y: number }>>(initialPositions)

  /**
   * Pass B: Replay Mode. `replayState` is a global singleton (replayStore.ts)
   * — ArtifactsPanel.tsx's "Replay Run" actions set it, this canvas reacts.
   * While a run is being replayed, the canvas renders a folded snapshot of
   * that run's own audit blocks (`buildReplaySnapshot`) instead of the live
   * spectator feed, and the live connection is paused (see the onMount
   * below) rather than left running underneath the replay.
   */
  const inReplay = createMemo(() => replayState.run !== null)
  const replaySnapshot = createMemo(() => (inReplay() ? buildReplaySnapshot(replayState.steps, replayState.stepIndex) : null))
  const view = createMemo(() => {
    const snap = replaySnapshot()
    if (snap) return { stageOrder: snap.stageOrder, agents: snap.agents, edges: snap.edges }
    return { stageOrder: swarm.state.stageOrder, agents: swarm.state.agents, edges: swarm.state.edges }
  })
  const packetEdge = createMemo(() => replaySnapshot()?.packetEdge ?? null)
  const focusAgent = createMemo(() => replaySnapshot()?.focusAgent ?? null)

  const [hoveredAgent, setHoveredAgent] = createSignal<AgentName | null>(null)
  createEffect(() => {
    if (!inReplay()) setHoveredAgent(null)
  })

  const inspectorBlock = createMemo<AuditBlock | null>(() => {
    const steps = replayState.steps
    if (steps.length === 0) return null
    const hovered = hoveredAgent()
    if (hovered) {
      for (let i = Math.min(replayState.stepIndex, steps.length - 1); i >= 0; i--) {
        const step = steps[i]!
        const payload = (step.payload ?? {}) as Record<string, unknown>
        if (step.action === 'agent_step' && String(payload.agent ?? '') === hovered) return step
      }
      return null
    }
    return steps[replayState.stepIndex] ?? null
  })

  // A brief tween (not SMIL) from the edge's source node to its target,
  // restarted from a clean snapshot every time the replayed step advances —
  // avoids cross-browser <animateMotion> restart quirks.
  const [packetPos, setPacketPos] = createSignal<{ x: number; y: number } | null>(null)
  createEffect(() => {
    const edge = packetEdge()
    replayState.stepIndex
    if (!edge) {
      setPacketPos(null)
      return
    }
    const from = positions[edge.source]
    const to = positions[edge.target]
    if (!from || !to) {
      setPacketPos(null)
      return
    }
    const duration = 900 / replayState.speed
    const start = performance.now()
    let raf = requestAnimationFrame(function tick(now: number) {
      const t = Math.min(1, (now - start) / duration)
      setPacketPos({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
      if (t < 1) raf = requestAnimationFrame(tick)
    })
    onCleanup(() => cancelAnimationFrame(raf))
  })

  function isPacketFocus(agent: AgentName): boolean {
    if (!inReplay()) return false
    const edge = packetEdge()
    if (edge) return edge.source === agent || edge.target === agent
    return focusAgent() === agent
  }

  // Larger runs (PO -> Architect -> N domain agents -> Policy -> Lead Dev)
  // can have twice the classic pipeline's node count — shrink nodes to keep
  // them from overlapping rather than hardcoding a 4-node layout.
  const radius = createMemo(() => {
    const n = view().stageOrder.length
    if (n <= 4) return 30
    if (n <= 6) return 24
    return 20
  })
  const badgeSize = createMemo(() => (radius() <= 22 ? 12 : 16))

  onMount(() => {
    let disconnect: (() => void) | null = null
    createEffect(() => {
      if (inReplay()) {
        disconnect?.()
        disconnect = null
      } else if (!disconnect) {
        disconnect = swarm.connect()
      }
    })
    onCleanup(() => disconnect?.())
  })

  onMount(() => {
    let stopLayout: (() => void) | null = null

    createEffect(() => {
      const order = view().stageOrder
      const anchors = computeAnchors(order)

      const initial: Record<AgentName, { x: number; y: number }> = {}
      for (const agent of order) {
        const anchor = anchors[agent]!
        const existing = positions[agent]
        initial[agent] = existing ?? { x: anchor.x + (Math.random() - 0.5) * 30, y: anchor.y + (Math.random() - 0.5) * 30 }
      }
      // Drops position entries for agents no longer in the run (a fresh
      // run's reset) and keeps everything else — no visual jump for nodes
      // that were already on-canvas.
      setPositions(reconcile(initial))

      stopLayout?.()
      if (order.length === 0) return

      const links: SimLink[] = order.slice(0, -1).map((source, i) => ({ source, target: order[i + 1]! }))
      const layout = createForceLayout(order, links, initial, anchors, {
        width: WIDTH,
        height: HEIGHT,
        linkDistance: Math.max(60, Math.min(120, (WIDTH - LAYOUT_MARGIN * 2) / Math.max(order.length - 1, 1))),
      })

      stopLayout = runLayoutSimulation(layout, (nodes) => {
        setPositions(
          produce((draft) => {
            for (const node of nodes) {
              const pos = draft[node.id]
              if (pos) {
                pos.x = node.x
                pos.y = node.y
              } else {
                draft[node.id] = { x: node.x, y: node.y }
              }
            }
          }),
        )
      })
    })

    onCleanup(() => stopLayout?.())
  })

  const showFeedbackArc = createMemo(
    () => view().stageOrder.includes('Planner') && view().stageOrder.includes('Reviewer'),
  )

  return (
    <section data-testid="swarm-canvas" class="w-full max-w-2xl rounded-lg border border-border bg-surface p-4 shadow-lg">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="text-left text-xs uppercase tracking-wide text-text-muted">Swarm</h2>
        <Show when={inReplay()}>
          <span class="text-[10px] font-medium uppercase tracking-wide text-accent">Replay Mode</span>
        </Show>
      </div>

      <Show when={inReplay()}>
        <div class="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-2 py-1.5 text-[11px]">
          <span class="font-medium text-text">
            Step {Math.max(replayState.stepIndex + 1, 0)} of {replayState.steps.length}
          </span>
          <button type="button" class="rounded border border-border px-1.5 py-0.5 hover:bg-surface-raised" onClick={() => stepBack()}>
            ⏮ Back
          </button>
          <button type="button" class="rounded border border-border px-1.5 py-0.5 hover:bg-surface-raised" onClick={() => togglePlay()}>
            {replayState.playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <button type="button" class="rounded border border-border px-1.5 py-0.5 hover:bg-surface-raised" onClick={() => stepForward()}>
            Forward ⏭
          </button>
          <div class="flex gap-1">
            <button
              type="button"
              class={`rounded border px-1.5 py-0.5 ${replayState.speed === 1 ? 'border-accent text-accent' : 'border-border text-text-muted'}`}
              onClick={() => setSpeed(1)}
            >
              1x
            </button>
            <button
              type="button"
              class={`rounded border px-1.5 py-0.5 ${replayState.speed === 2 ? 'border-accent text-accent' : 'border-border text-text-muted'}`}
              onClick={() => setSpeed(2)}
            >
              2x
            </button>
          </div>
          <button
            type="button"
            class="ml-auto rounded border border-red-400/40 px-1.5 py-0.5 text-red-400 hover:bg-red-400/10"
            onClick={() => stopReplay()}
          >
            ✕ Exit
          </button>
        </div>
      </Show>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        class="h-auto w-full"
        role="img"
        aria-label="Multi-agent swarm pipeline, updates live as agents execute"
      >
        <defs>
          <marker id="swarm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="fill-accent" />
          </marker>
        </defs>

        <Show when={showFeedbackArc() && positions.Reviewer && positions.Planner}>
          <path
            d={feedbackArc(positions.Reviewer!, positions.Planner!, radius())}
            fill="none"
            class="stroke-border"
            stroke-width="1.5"
            stroke-dasharray="2 4"
            marker-end="url(#swarm-arrow)"
          />
        </Show>

        <For each={view().stageOrder.slice(0, -1)}>
          {(source, i) => {
            const target = () => view().stageOrder[i() + 1]!
            const isActive = () => view().edges[edgeKey(source, target())]
            const from = () => positions[source]
            const to = () => positions[target()]
            return (
              <Show when={from() && to()}>
                <path
                  d={edgePath(from()!, to()!, radius())}
                  fill="none"
                  class={isActive() ? 'swarm-path stroke-accent-glow' : 'stroke-border'}
                  stroke-width={isActive() ? 2.5 : 1.5}
                  stroke-dasharray="6 4"
                  marker-end="url(#swarm-arrow)"
                />
              </Show>
            )
          }}
        </For>

        <Show when={packetPos()}>
          {(pos) => <circle cx={pos().x} cy={pos().y} r="5" class="fill-amber-300 drop-shadow-[0_0_5px_rgba(251,191,36,0.9)]" />}
        </Show>

        <For each={view().stageOrder}>
          {(agent) => {
            const status = () => view().agents[agent]?.status ?? 'idle'
            const pos = () => positions[agent]
            const isBusy = () => status() === 'active' || status() === 'thinking'
            const label = () => {
              const s = status()
              if (s === 'completed') return 'done'
              if (s === 'error') return 'error'
              if (isBusy()) return microStatusFor(agent)
              return roleFor(agent)
            }
            return (
              <Show when={pos()}>
                <g
                  onPointerEnter={() => inReplay() && setHoveredAgent(agent)}
                  onPointerLeave={() => setHoveredAgent((current) => (current === agent ? null : current))}
                >
                  <Show when={isPacketFocus(agent)}>
                    <circle
                      cx={pos()!.x}
                      cy={pos()!.y}
                      r={radius() + 6}
                      fill="none"
                      class="animate-pulse stroke-amber-400"
                      stroke-width="2"
                      stroke-dasharray="4 3"
                    />
                  </Show>
                  <circle
                    cx={pos()!.x}
                    cy={pos()!.y}
                    r={radius()}
                    class={`fill-surface-raised transition-[stroke,filter] duration-300 ${STATUS_STROKE[status()]} ${STATUS_GLOW_CLASS[status()]} ${
                      status() === 'thinking' ? 'animate-pulse' : ''
                    }`}
                    stroke-width={status() === 'idle' ? 1.5 : 2.5}
                  />
                  <text x={pos()!.x} y={pos()!.y + 4} text-anchor="middle" class="fill-text text-[10px] font-medium">
                    {agent}
                  </text>

                  <Show
                    when={isBusy()}
                    fallback={
                      <text x={pos()!.x} y={pos()!.y + radius() + 16} text-anchor="middle" class="fill-text-muted text-[9px]">
                        {label()}
                      </text>
                    }
                  >
                    <g class="animate-pulse">
                      <rect
                        x={pos()!.x - 48}
                        y={pos()!.y + radius() + 6}
                        width={96}
                        height={14}
                        rx={7}
                        class="fill-accent/15 stroke-accent-glow"
                        stroke-width="1"
                      />
                      <text x={pos()!.x} y={pos()!.y + radius() + 16} text-anchor="middle" class="fill-accent text-[8px] font-medium">
                        {label()}
                      </text>
                    </g>
                  </Show>
                </g>
              </Show>
            )
          }}
        </For>

        {/*
          Rendered as its own pass, after every node's circle/label/status
          badge, rather than nested inside each node's own <g> above. SVG
          paints strictly in DOM order — when badges lived inside each
          node's <g>, a node positioned close to its neighbor (routine in
          the denser 6-8 node swarm layouts) would have its badge painted
          OVER by the next node's own opaque circle, reading as badges
          "clumping" under the wrong node or vanishing. A dedicated
          top-level pass guarantees every badge paints above every node
          regardless of layout spacing. `pointer-events-none` keeps the
          badge from stealing the hover events the node's own <g> registers
          for Replay Mode's Packet Inspector.
        */}
        <For each={view().stageOrder}>
          {(agent) => {
            const pos = () => positions[agent]
            // On the node circle's own edge at a fixed 45° — scales with
            // radius exactly (not an approximated multiplier), so the badge
            // sits consistently at the boundary regardless of node size.
            const badgeOffset = () => radius() * Math.SQRT1_2
            return (
              <Show when={pos()}>
                <RnAvatar
                  x={pos()!.x + badgeOffset() - badgeSize() / 2}
                  y={pos()!.y + badgeOffset() - badgeSize() / 2}
                  width={badgeSize()}
                  height={badgeSize()}
                  class="pointer-events-none drop-shadow-sm"
                />
              </Show>
            )
          }}
        </For>
      </svg>

      <Show when={inReplay()}>
        <div class="mt-3 rounded-md border border-border/60 bg-bg px-3 py-2">
          <div class="mb-1 flex items-center justify-between text-[10px] text-text-muted">
            <span>Packet Inspector{hoveredAgent() ? ` — ${hoveredAgent()}` : ''}</span>
            <Show when={hoveredAgent()}>
              <button type="button" class="text-accent hover:underline" onClick={() => setHoveredAgent(null)}>
                Back to current step
              </button>
            </Show>
          </div>
          <Show when={inspectorBlock()} fallback={<p class="text-[11px] text-text-muted">No step data for this run.</p>}>
            {(block) => (
              <>
                <p class="mb-1 text-[11px] text-text">
                  <span class="font-medium">{block().action}</span>{' '}
                  <span class="text-text-muted">
                    {new Date(block().timestamp).toLocaleTimeString(undefined, { hour12: false })}
                  </span>
                </p>
                <pre class="max-h-24 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] text-text-muted">
                  {JSON.stringify(block().payload, null, 2)}
                </pre>
              </>
            )}
          </Show>
        </div>
      </Show>
    </section>
  )
}
