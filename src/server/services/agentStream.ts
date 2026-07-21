import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'

type AgentName = 'Planner' | 'Architect' | 'Lead Dev' | 'Reviewer'

interface PipelineStage {
  agent: AgentName
  thought: string
}

const PIPELINE: PipelineStage[] = [
  {
    agent: 'Planner',
    thought: 'Breaking the request into a task graph and identifying dependencies.',
  },
  {
    agent: 'Architect',
    thought: 'Selecting module boundaries and defining data flow between services.',
  },
  {
    agent: 'Lead Dev',
    thought: 'Drafting the implementation across the affected files.',
  },
  {
    agent: 'Reviewer',
    thought: 'Checking correctness, edge cases, and test coverage before sign-off.',
  },
]

const TOKEN_DELAY_MS = 40
const STAGE_GAP_MS = 150

function heapMb() {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10
}

export function agentStreamHandler(c: Context) {
  return streamSSE(c, async (stream) => {
    let eventId = 0
    let aborted = false
    stream.onAbort(() => {
      aborted = true
    })

    const send = (event: string, data: unknown) =>
      stream.writeSSE({ event, id: String(eventId++), data: JSON.stringify(data) })

    await send('system_alert', {
      level: 'info',
      message: 'connected to agent stream',
      timestamp: new Date().toISOString(),
    })

    for (const { agent, thought } of PIPELINE) {
      if (aborted) return
      const startedAt = Date.now()

      await send('agent_step', {
        agent,
        state: 'EXECUTING',
        timestamp: new Date().toISOString(),
      })

      for (const word of thought.split(' ')) {
        if (aborted) return
        await send('token_stream', { agent, token: `${word} ` })
        await stream.sleep(TOKEN_DELAY_MS)
      }

      if (aborted) return

      await send('metric_tick', {
        agent,
        latencyMs: Date.now() - startedAt,
        memoryMb: heapMb(),
        timestamp: new Date().toISOString(),
      })

      await send('agent_step', {
        agent,
        state: 'DONE',
        timestamp: new Date().toISOString(),
      })

      await stream.sleep(STAGE_GAP_MS)
    }

    if (aborted) return

    await send('system_alert', {
      level: 'info',
      message: 'pipeline complete',
      timestamp: new Date().toISOString(),
    })
  })
}
