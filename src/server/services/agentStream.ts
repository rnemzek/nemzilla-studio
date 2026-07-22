import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { generateAppSnippet } from '../prompts/appGeneratorPrompt.ts'
import { checkForbiddenOperation, checkRateLimit } from './policyEngine.ts'
import { enqueueAuditEvent } from './auditLedger.ts'

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
const CODE_CHUNK_SIZE = 24
const CODE_CHUNK_DELAY_MS = 8

function heapMb() {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10
}

function chunkString(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

export function agentStreamHandler(c: Context) {
  // Optional: `?prompt=...` opts the Lead Dev stage into additionally
  // synthesizing and streaming a generated_app_payload for AppPreview. Only
  // present when a caller asks for it — SwarmCanvas/Terminal's plain (no
  // query param) connections are completely unaffected, preserving the
  // existing pipeline shape/tests.
  const prompt = c.req.query('prompt')

  // System Ceiling: every connection is an "API call" against the platform's
  // hard rate limit (see policyEngine.ts / AGENTZ-STUDIO-SDK.md section 6).
  // Checked before opening the SSE stream at all, so a denial is a plain 429.
  const rateLimit = checkRateLimit()
  if (!rateLimit.allowed) {
    enqueueAuditEvent('rate_limit_denied', { prompt: prompt ?? null, reason: rateLimit.reason }, 'denied')
    return c.json({ error: rateLimit.reason }, 429)
  }
  enqueueAuditEvent('stream_connected', { prompt: prompt ?? null }, 'allowed')

  const forbidden = prompt ? checkForbiddenOperation(prompt) : { allowed: true }
  if (!forbidden.allowed) {
    enqueueAuditEvent('generation_request', { prompt, reason: forbidden.reason }, 'denied')
  }

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

    if (prompt && !forbidden.allowed) {
      await send('system_alert', {
        level: 'error',
        message: `Generation refused: ${forbidden.reason}`,
        timestamp: new Date().toISOString(),
      })
    }

    for (const { agent, thought } of PIPELINE) {
      if (aborted) return
      const startedAt = Date.now()

      await send('agent_step', {
        agent,
        state: 'EXECUTING',
        timestamp: new Date().toISOString(),
      })
      enqueueAuditEvent('agent_step', { agent, state: 'EXECUTING' }, 'allowed')

      for (const word of thought.split(' ')) {
        if (aborted) return
        await send('token_stream', { agent, token: `${word} ` })
        await stream.sleep(TOKEN_DELAY_MS)
      }

      if (aborted) return

      if (agent === 'Lead Dev' && prompt && forbidden.allowed) {
        const { scenario, code, policyCheck } = generateAppSnippet(prompt)
        if (policyCheck) {
          enqueueAuditEvent(
            'policy_check',
            { type: 'order_threshold', scenario, ...policyCheck },
            policyCheck.clamped ? 'clamped' : 'allowed',
          )
        }
        for (const chunk of chunkString(code, CODE_CHUNK_SIZE)) {
          if (aborted) return
          await send('generated_app_payload', { scenario, code: chunk, done: false })
          await stream.sleep(CODE_CHUNK_DELAY_MS)
        }
        if (aborted) return
        await send('generated_app_payload', { scenario, code, done: true })
        enqueueAuditEvent('generated_app_payload', { scenario, size: code.length }, 'allowed')
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
      enqueueAuditEvent('agent_step', { agent, state: 'DONE' }, 'allowed')

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
