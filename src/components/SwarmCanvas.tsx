import { For, Show, createEffect, createMemo, onCleanup, onMount } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { createForceLayout, runLayoutSimulation, type SimLink } from '../lib/swarmLayout.ts'
import { createSwarmStore, edgeKey, DEFAULT_STAGE_ORDER, type AgentName, type AgentStatus } from '../lib/swarmStore.ts'
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

const STATUS_GLOW: Record<AgentStatus, string | undefined> = {
  idle: undefined,
  active: 'drop-shadow(0 0 6px var(--color-accent-glow))',
  thinking: 'drop-shadow(0 0 6px var(--color-accent-glow))',
  completed: 'drop-shadow(0 0 4px rgba(52,211,153,0.6))',
  error: 'drop-shadow(0 0 6px rgba(248,113,113,0.7))',
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

  // Larger runs (PO -> Architect -> N domain agents -> Policy -> Lead Dev)
  // can have twice the classic pipeline's node count — shrink nodes to keep
  // them from overlapping rather than hardcoding a 4-node layout.
  const radius = createMemo(() => {
    const n = swarm.state.stageOrder.length
    if (n <= 4) return 30
    if (n <= 6) return 24
    return 20
  })
  const badgeSize = createMemo(() => (radius() <= 22 ? 12 : 16))

  onMount(() => {
    const disconnect = swarm.connect()
    onCleanup(disconnect)
  })

  onMount(() => {
    let stopLayout: (() => void) | null = null

    createEffect(() => {
      const order = swarm.state.stageOrder
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
    () => swarm.state.stageOrder.includes('Planner') && swarm.state.stageOrder.includes('Reviewer'),
  )

  return (
    <section data-testid="swarm-canvas" class="w-full max-w-2xl rounded-lg border border-border bg-surface p-4 shadow-lg">
      <h2 class="mb-2 text-left text-xs uppercase tracking-wide text-text-muted">Swarm</h2>
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

        <For each={swarm.state.stageOrder.slice(0, -1)}>
          {(source, i) => {
            const target = () => swarm.state.stageOrder[i() + 1]!
            const isActive = () => swarm.state.edges[edgeKey(source, target())]
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

        <For each={swarm.state.stageOrder}>
          {(agent) => {
            const status = () => swarm.state.agents[agent]?.status ?? 'idle'
            const pos = () => positions[agent]
            const isBusy = () => status() === 'active' || status() === 'thinking'
            const label = () => {
              const s = status()
              if (s === 'completed') return 'done'
              if (s === 'error') return 'error'
              if (isBusy()) return microStatusFor(agent)
              return roleFor(agent)
            }
            const badgeOffset = () => radius() * 0.72
            return (
              <Show when={pos()}>
                <g>
                  <circle
                    cx={pos()!.x}
                    cy={pos()!.y}
                    r={radius()}
                    class={`fill-surface-raised transition-[stroke,filter] duration-300 ${STATUS_STROKE[status()]} ${
                      status() === 'thinking' ? 'animate-pulse' : ''
                    }`}
                    stroke-width={status() === 'idle' ? 1.5 : 2.5}
                    style={STATUS_GLOW[status()] ? { filter: STATUS_GLOW[status()] } : undefined}
                  />
                  <text x={pos()!.x} y={pos()!.y + 4} text-anchor="middle" class="fill-text text-[10px] font-medium">
                    {agent}
                  </text>
                  <RnAvatar
                    x={pos()!.x + badgeOffset() - badgeSize() / 2}
                    y={pos()!.y + badgeOffset() - badgeSize() / 2}
                    width={badgeSize()}
                    height={badgeSize()}
                    class="drop-shadow-sm"
                  />

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
      </svg>
    </section>
  )
}
