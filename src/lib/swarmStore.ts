import { createStore, produce, reconcile } from 'solid-js/store'
import { apiClient } from './apiClient.ts'

export type AgentName = 'Planner' | 'Architect' | 'Lead Dev' | 'Reviewer'
export type AgentStatus = 'idle' | 'thinking' | 'active' | 'completed' | 'error'

export interface AgentState {
  status: AgentStatus
  latencyMs: number | null
  memoryMb: number | null
}

export interface SwarmState {
  agents: Record<AgentName, AgentState>
  /** Keyed by `edgeKey(source, target)` — true while data is in transit on that edge. */
  edges: Record<string, boolean>
  connected: boolean
  message: string | null
}

export const PIPELINE_ORDER: AgentName[] = ['Planner', 'Architect', 'Lead Dev', 'Reviewer']

export function edgeKey(source: AgentName, target: AgentName): string {
  return `${source}->${target}`
}

function createInitialState(): SwarmState {
  const agents = {} as Record<AgentName, AgentState>
  for (const agent of PIPELINE_ORDER) {
    agents[agent] = { status: 'idle', latencyMs: null, memoryMb: null }
  }

  const edges: Record<string, boolean> = {}
  for (let i = 0; i < PIPELINE_ORDER.length - 1; i++) {
    edges[edgeKey(PIPELINE_ORDER[i]!, PIPELINE_ORDER[i + 1]!)] = false
  }

  return { agents, edges, connected: false, message: null }
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
        const agent = data.agent as AgentName
        const step = data.state
        const idx = PIPELINE_ORDER.indexOf(agent)
        if (idx === -1) break

        if (step === 'EXECUTING') {
          setState('agents', agent, 'status', 'active')
          if (idx > 0) setState('edges', edgeKey(PIPELINE_ORDER[idx - 1]!, agent), false)
        } else if (step === 'DONE') {
          setState('agents', agent, 'status', 'completed')
          if (idx < PIPELINE_ORDER.length - 1) {
            setState('edges', edgeKey(agent, PIPELINE_ORDER[idx + 1]!), true)
          }
        }
        break
      }
      case 'token_stream': {
        const agent = data.agent as AgentName
        if (PIPELINE_ORDER.includes(agent)) setState('agents', agent, 'status', 'thinking')
        break
      }
      case 'metric_tick': {
        const agent = data.agent as AgentName
        if (!PIPELINE_ORDER.includes(agent)) break
        setState('agents', agent, {
          status: 'active',
          latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : null,
          memoryMb: typeof data.memoryMb === 'number' ? data.memoryMb : null,
        })
        break
      }
    }
  }

  function connect(): () => void {
    const controller = new AbortController()

    setState(reconcile(createInitialState()))
    setState('connected', true)

    ;(async () => {
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
      } catch (err) {
        if (controller.signal.aborted) return
        setState('message', err instanceof Error ? err.message : String(err))
        setState(
          produce((draft) => {
            for (const agent of PIPELINE_ORDER) {
              if (draft.agents[agent].status === 'active' || draft.agents[agent].status === 'thinking') {
                draft.agents[agent].status = 'error'
              }
            }
          }),
        )
      } finally {
        if (!controller.signal.aborted) setState('connected', false)
      }
    })()

    return () => controller.abort()
  }

  return { state, connect }
}
