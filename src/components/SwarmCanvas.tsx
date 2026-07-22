import { For, onCleanup, onMount } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { createForceLayout, runLayoutSimulation } from '../lib/swarmLayout.ts'
import { createSwarmStore, edgeKey, type AgentName, type AgentStatus } from '../lib/swarmStore.ts'
import RnAvatar from './RnAvatar.tsx'

interface AgentMeta {
  agent: AgentName
  role: string
}

interface AgentLink {
  source: AgentName
  target: AgentName
}

const RADIUS = 30
const WIDTH = 480
const HEIGHT = 220
// RN brand-mark badge tucked into each node's bottom-right corner.
const BADGE_SIZE = 16
const BADGE_OFFSET = RADIUS * 0.72

const AGENTS: AgentMeta[] = [
  { agent: 'Planner', role: 'Task decomposition' },
  { agent: 'Architect', role: 'System design' },
  { agent: 'Lead Dev', role: 'Implementation' },
  { agent: 'Reviewer', role: 'QA & sign-off' },
]

const ANCHOR_POSITIONS: Record<AgentName, { x: number; y: number }> = {
  Planner: { x: 60, y: 110 },
  Architect: { x: 180, y: 110 },
  'Lead Dev': { x: 300, y: 110 },
  Reviewer: { x: 420, y: 110 },
}

const LINKS: AgentLink[] = [
  { source: 'Planner', target: 'Architect' },
  { source: 'Architect', target: 'Lead Dev' },
  { source: 'Lead Dev', target: 'Reviewer' },
]

const STATUS_LABEL: Record<AgentStatus, string | null> = {
  idle: null,
  active: 'executing',
  thinking: 'thinking…',
  completed: 'done',
  error: 'error',
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

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  return `M${from.x + ux * RADIUS},${from.y + uy * RADIUS} L${to.x - ux * RADIUS},${to.y - uy * RADIUS}`
}

function feedbackArc(from: { x: number; y: number }, to: { x: number; y: number }): string {
  return `M${from.x},${from.y + RADIUS} C ${from.x},${from.y + 90} ${to.x},${to.y + 90} ${to.x},${to.y + RADIUS}`
}

export default function SwarmCanvas() {
  // Start each node jittered off its anchor so the force simulation has
  // visible work to do settling back toward the pipeline layout.
  const startPositions = AGENTS.reduce(
    (acc, { agent }) => {
      const anchor = ANCHOR_POSITIONS[agent]
      acc[agent] = {
        x: anchor.x + (Math.random() - 0.5) * 40,
        y: anchor.y + (Math.random() - 0.5) * 40,
      }
      return acc
    },
    {} as Record<AgentName, { x: number; y: number }>,
  )

  const [positions, setPositions] = createStore(startPositions)
  const swarm = createSwarmStore()

  onMount(() => {
    const layout = createForceLayout(
      AGENTS.map((a) => a.agent),
      LINKS,
      startPositions,
      ANCHOR_POSITIONS,
      { width: WIDTH, height: HEIGHT, linkDistance: 120 },
    )

    const stopLayout = runLayoutSimulation(layout, (nodes) => {
      setPositions(
        produce((draft) => {
          for (const node of nodes) {
            const pos = draft[node.id as AgentName]
            pos.x = node.x
            pos.y = node.y
          }
        }),
      )
    })

    onCleanup(stopLayout)
  })

  onMount(() => {
    const disconnect = swarm.connect()
    onCleanup(disconnect)
  })

  return (
    <section data-testid="swarm-canvas" class="w-full max-w-2xl rounded-lg border border-border bg-surface p-4 shadow-lg">
      <h2 class="mb-2 text-left text-xs uppercase tracking-wide text-text-muted">Swarm</h2>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        class="h-auto w-full"
        role="img"
        aria-label="Multi-agent swarm pipeline: Planner, Architect, Lead Dev, Reviewer"
      >
        <defs>
          <marker id="swarm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" class="fill-accent" />
          </marker>
        </defs>

        <path
          d={feedbackArc(positions.Reviewer, positions.Planner)}
          fill="none"
          class="stroke-border"
          stroke-width="1.5"
          stroke-dasharray="2 4"
          marker-end="url(#swarm-arrow)"
        />

        <For each={LINKS}>
          {(link) => {
            const isActive = () => swarm.state.edges[edgeKey(link.source, link.target)]
            return (
              <path
                d={edgePath(positions[link.source], positions[link.target])}
                fill="none"
                class={isActive() ? 'swarm-path stroke-accent-glow' : 'stroke-border'}
                stroke-width={isActive() ? 2.5 : 1.5}
                stroke-dasharray="6 4"
                marker-end="url(#swarm-arrow)"
              />
            )
          }}
        </For>

        <For each={AGENTS}>
          {(meta) => {
            const status = () => swarm.state.agents[meta.agent].status
            const pos = () => positions[meta.agent]
            const label = () => STATUS_LABEL[status()] ?? meta.role
            return (
              <g>
                <circle
                  cx={pos().x}
                  cy={pos().y}
                  r={RADIUS}
                  class={`fill-surface-raised transition-[stroke,filter] duration-300 ${STATUS_STROKE[status()]} ${
                    status() === 'thinking' ? 'animate-pulse' : ''
                  }`}
                  stroke-width={status() === 'idle' ? 1.5 : 2.5}
                  style={STATUS_GLOW[status()] ? { filter: STATUS_GLOW[status()] } : undefined}
                />
                <text x={pos().x} y={pos().y + 4} text-anchor="middle" class="fill-text text-[11px] font-medium">
                  {meta.agent}
                </text>
                <text x={pos().x} y={pos().y + RADIUS + 16} text-anchor="middle" class="fill-text-muted text-[9px]">
                  {label()}
                </text>
                <RnAvatar
                  x={pos().x + BADGE_OFFSET - BADGE_SIZE / 2}
                  y={pos().y + BADGE_OFFSET - BADGE_SIZE / 2}
                  width={BADGE_SIZE}
                  height={BADGE_SIZE}
                  class="drop-shadow-sm"
                />
              </g>
            )
          }}
        </For>
      </svg>
    </section>
  )
}
