import { createStore, produce, reconcile } from 'solid-js/store'
import { apiClient } from './apiClient.ts'

/**
 * Pass A: agent names are no longer restricted to the classic
 * Planner/Architect/Lead Dev/Reviewer set — the "Andiamo!" swarm pipeline
 * (agentStream.ts's runSwarmPipeline()) emits its own stage names (`PO`,
 * `Architect`, one entry per dynamically-dispatched domain agent like
 * `AI Sport`, `Policy`, `Lead Dev`), and this store now renders whichever
 * pipeline is actually running instead of silently dropping anything that
 * isn't one of the original 4 names.
 */
export type AgentName = string
export type AgentStatus = 'idle' | 'thinking' | 'active' | 'completed' | 'error'

export interface AgentState {
  status: AgentStatus
  latencyMs: number | null
  memoryMb: number | null
}

export interface SwarmState {
  /** First-seen order of agents in the current run — grows as new stages/domain agents announce themselves. */
  stageOrder: AgentName[]
  agents: Record<AgentName, AgentState>
  /** Keyed by `edgeKey(source, target)` — true while data is in transit on that edge. */
  edges: Record<string, boolean>
  connected: boolean
  message: string | null
}

/** Idle placeholder shown before any run has ever started on this connection. */
export const DEFAULT_STAGE_ORDER: AgentName[] = ['Planner', 'Architect', 'Lead Dev', 'Reviewer']

/**
 * The first stage of each pipeline this app runs — seeing an EXECUTING beat
 * for one of these means a *new* run has begun, so the canvas resets to a
 * clean slate first rather than appending onto the previous run's finished
 * nodes (satisfies "pipeline resets and updates cleanly across multiple
 * runs" regardless of which pipeline — classic or swarm — just started).
 */
const RUN_START_AGENTS = new Set(['Planner', 'PO'])

export function edgeKey(source: AgentName, target: AgentName): string {
  return `${source}->${target}`
}

function emptyAgentState(): AgentState {
  return { status: 'idle', latencyMs: null, memoryMb: null }
}

function createInitialState(): SwarmState {
  const agents = {} as Record<AgentName, AgentState>
  for (const agent of DEFAULT_STAGE_ORDER) agents[agent] = emptyAgentState()

  const edges: Record<string, boolean> = {}
  for (let i = 0; i < DEFAULT_STAGE_ORDER.length - 1; i++) {
    edges[edgeKey(DEFAULT_STAGE_ORDER[i]!, DEFAULT_STAGE_ORDER[i + 1]!)] = false
  }

  return { stageOrder: [...DEFAULT_STAGE_ORDER], agents, edges, connected: false, message: null }
}

/** A true clean slate (no placeholder nodes) — used when a new run actually starts. */
function resetForNewRun(draft: SwarmState): void {
  draft.stageOrder = []
  draft.agents = {}
  draft.edges = {}
}

/** Adds `name` to the run if this is the first time it's been seen, wiring the incoming edge from whatever the previous stage was. */
function ensureAgent(draft: SwarmState, name: AgentName): void {
  if (!draft.agents[name]) draft.agents[name] = emptyAgentState()
  if (draft.stageOrder.includes(name)) return

  const prevName = draft.stageOrder[draft.stageOrder.length - 1]
  draft.stageOrder.push(name)
  if (prevName) {
    // If the predecessor already finished before this stage was announced
    // (a fast-dispatching domain agent list), light the edge immediately.
    draft.edges[edgeKey(prevName, name)] = draft.agents[prevName]?.status === 'completed'
  }
}

function parseFrame(chunk: string): { event: string; data: Record<string, unknown> } {
  let event = ''
  const dataLines: string[] = []
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice('event: '.length)
    else if (line.startsWith('data: ')) dataLines.push(line.slice('data: '.length))
  }
  if (!event || dataLines.length === 0) return { event: '', data: {} }
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) as Record<string, unknown> }
  } catch {
    return { event: '', data: {} }
  }
}

export interface SwarmStore {
  state: SwarmState
  /** Opens a fresh SSE connection to /api/agent/spectate. Returns a function to disconnect. */
  connect: () => () => void
}

/**
 * Owns the swarm's reactive state and knows how to parse `/api/agent/spectate`
 * SSE frames (`agent_step`, `token_stream`, `metric_tick`, `system_alert`)
 * into per-agent statuses and per-edge "data in transit" flags. This is a
 * pure spectator connection (never `/api/agent/stream`) — the swarm canvas
 * only ever *visualizes* whatever build is active server-wide (see
 * sessionManager.ts's single-active-builder model); it never itself starts
 * an unprompted build, which would otherwise race AppPreview/Terminal for
 * the builder role and could win it with no prompt attached.
 *
 *   idle -> active (agent_step EXECUTING) -> thinking (token_stream)
 *        -> active (metric_tick, wrapping up) -> completed (agent_step DONE)
 *
 * The edge leading into a node clears the instant that node goes active
 * (the data has arrived), and the edge leading out of a node lights up the
 * instant it completes (the baton is being passed to the next agent).
 * `error` is reserved for a dropped/failed connection: whichever agent was
 * still `active`/`thinking` when the stream broke is flipped to `error`.
 */
export function createSwarmStore(): SwarmStore {
  const [state, setState] = createStore<SwarmState>(createInitialState())

  function dispatch(event: string, data: Record<string, unknown>) {
    switch (event) {
      case 'system_alert': {
        setState('message', typeof data.message === 'string' ? data.message : null)
        break
      }
      case 'agent_step': {
        const agent = String(data.agent ?? '')
        const step = data.state
        if (!agent) break

        setState(
          produce((draft) => {
            if (step === 'EXECUTING' && RUN_START_AGENTS.has(agent)) resetForNewRun(draft)
            ensureAgent(draft, agent)

            if (step === 'EXECUTING') {
              draft.agents[agent]!.status = 'active'
              const idx = draft.stageOrder.indexOf(agent)
              if (idx > 0) draft.edges[edgeKey(draft.stageOrder[idx - 1]!, agent)] = false
            } else if (step === 'DONE') {
              draft.agents[agent]!.status = 'completed'
              const idx = draft.stageOrder.indexOf(agent)
              if (idx !== -1 && idx < draft.stageOrder.length - 1) {
                draft.edges[edgeKey(agent, draft.stageOrder[idx + 1]!)] = true
              }
            }
          }),
        )
        break
      }
      case 'token_stream': {
        const agent = String(data.agent ?? '')
        if (!agent) break
        setState(
          produce((draft) => {
            ensureAgent(draft, agent)
            draft.agents[agent]!.status = 'thinking'
          }),
        )
        break
      }
      case 'metric_tick': {
        const agent = String(data.agent ?? '')
        if (!agent) break
        setState(
          produce((draft) => {
            ensureAgent(draft, agent)
            draft.agents[agent] = {
              status: 'active',
              latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : null,
              memoryMb: typeof data.memoryMb === 'number' ? data.memoryMb : null,
            }
          }),
        )
        break
      }
    }
  }

  /**
   * `/api/agent/spectate` is a *per-build* stream by design — it closes with
   * a `session_ended` frame once the build it's watching finishes (verified
   * by scripts/verify-agent-stream.ts, which depends on that shape). A
   * one-shot `connect()` would therefore only ever see the single build that
   * happened to be active at connection time — dead for good the moment
   * that build ends, silently missing every subsequent run (Pass A: this is
   * exactly why the swarm canvas used to freeze after the page's initial
   * auto-run and never picked up a later "Andiamo!" launch). So this loops,
   * transparently reconnecting after each natural stream close, for as long
   * as this store stays connected.
   */
  function connect(): () => void {
    const controller = new AbortController()
    let stopped = false

    setState(reconcile(createInitialState()))
    setState('connected', true)

    async function runLoop() {
      while (!stopped) {
        try {
          const res = await apiClient.api.agent.spectate.$get(undefined, {
            init: { signal: controller.signal },
          })
          if (!res.body) throw new Error('agent stream: empty response body')

          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            let boundary = buffer.indexOf('\n\n')
            while (boundary !== -1) {
              const { event, data } = parseFrame(buffer.slice(0, boundary))
              buffer = buffer.slice(boundary + 2)
              if (event) dispatch(event, data)
              boundary = buffer.indexOf('\n\n')
            }
          }
          // Stream ended naturally (the build it was watching finished) —
          // loop back around and reconnect to watch whatever runs next.
        } catch (err) {
          if (controller.signal.aborted) return
          setState('message', err instanceof Error ? err.message : String(err))
          setState(
            produce((draft) => {
              for (const agent of draft.stageOrder) {
                if (draft.agents[agent]?.status === 'active' || draft.agents[agent]?.status === 'thinking') {
                  draft.agents[agent]!.status = 'error'
                }
              }
            }),
          )
          // Brief backoff before retrying, so a down server doesn't spin this into a hot loop.
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
    }

    void runLoop()

    return () => {
      stopped = true
      controller.abort()
      setState('connected', false)
    }
  }

  return { state, connect }
}
