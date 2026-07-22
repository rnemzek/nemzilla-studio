import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { generateAppSnippet } from '../prompts/appGeneratorPrompt.ts'
import { checkForbiddenOperation, checkRateLimit } from './policyEngine.ts'
import { enqueueAuditEvent, getSessionAuditBlocks } from './auditLedger.ts'
import { recordCompletedBuild } from './sessionSerializer.ts'
import {
  broadcastFrame,
  claimSession,
  endSession,
  getBacklog,
  isAborted,
  requestAbort,
  subscribe,
  type SessionFrame,
  type SessionRole,
} from './sessionManager.ts'

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
// Best-effort delay before snapshotting a completed build's own audit trail —
// enqueueAuditEvent() is non-blocking (drained via setImmediate), so the
// Reviewer stage's very last events need a beat to land in auditLedger's
// chain before getSessionAuditBlocks() reads it. Filtering by sessionId
// (rather than an index range) means a *later* build starting immediately
// afterward can't pollute this snapshot even if the settle delay is generous.
const SERIALIZE_SETTLE_MS = 150

function heapMb() {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10
}

function chunkString(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The actual pipeline simulation — runs exactly once per active build,
 * broadcast to every subscriber (builder + spectators alike) via
 * sessionManager rather than writing to any one specific HTTP stream.
 */
async function runPipeline(sessionId: string, prompt?: string): Promise<void> {
  const send = (event: string, data: unknown) => broadcastFrame(event, data)
  const audit = (action: string, payload: unknown, policyStatus?: Parameters<typeof enqueueAuditEvent>[2]) =>
    enqueueAuditEvent(action, payload, policyStatus, sessionId)
  let generatedApp: { scenario: string; code: string } | null = null

  send('system_alert', {
    level: 'info',
    message: 'connected to agent stream',
    timestamp: new Date().toISOString(),
  })

  const forbidden = prompt ? checkForbiddenOperation(prompt) : { allowed: true }
  if (prompt && !forbidden.allowed) {
    audit('generation_request', { prompt, reason: forbidden.reason }, 'denied')
    send('system_alert', {
      level: 'error',
      message: `Generation refused: ${forbidden.reason}`,
      timestamp: new Date().toISOString(),
    })
  }

  for (const { agent, thought } of PIPELINE) {
    if (isAborted(sessionId)) return
    const startedAt = Date.now()

    send('agent_step', { agent, state: 'EXECUTING', timestamp: new Date().toISOString() })
    audit('agent_step', { agent, state: 'EXECUTING' })

    for (const word of thought.split(' ')) {
      if (isAborted(sessionId)) return
      send('token_stream', { agent, token: `${word} ` })
      await sleep(TOKEN_DELAY_MS)
    }

    if (isAborted(sessionId)) return

    if (agent === 'Lead Dev' && prompt && forbidden.allowed) {
      const { scenario, code, policyCheck } = generateAppSnippet(prompt)
      if (policyCheck) {
        audit('policy_check', { type: 'order_threshold', scenario, ...policyCheck }, policyCheck.clamped ? 'clamped' : 'allowed')
      }
      for (const chunk of chunkString(code, CODE_CHUNK_SIZE)) {
        if (isAborted(sessionId)) return
        send('generated_app_payload', { scenario, code: chunk, done: false })
        await sleep(CODE_CHUNK_DELAY_MS)
      }
      if (isAborted(sessionId)) return
      send('generated_app_payload', { scenario, code, done: true })
      audit('generated_app_payload', { scenario, size: code.length })
      generatedApp = { scenario, code }
    }

    if (isAborted(sessionId)) return

    send('metric_tick', {
      agent,
      latencyMs: Date.now() - startedAt,
      memoryMb: heapMb(),
      timestamp: new Date().toISOString(),
    })
    send('agent_step', { agent, state: 'DONE', timestamp: new Date().toISOString() })
    audit('agent_step', { agent, state: 'DONE' })

    await sleep(STAGE_GAP_MS)
  }

  if (isAborted(sessionId)) return

  send('system_alert', {
    level: 'info',
    message: 'pipeline complete',
    timestamp: new Date().toISOString(),
  })

  if (generatedApp && prompt) {
    const { scenario, code } = generatedApp
    // Best-effort settle: enqueueAuditEvent() is non-blocking (drained via
    // setImmediate), so the Reviewer stage's very last audit events need a
    // beat to land in auditLedger's chain before getSessionAuditBlocks()
    // reads it. Filtering by sessionId (not an index range) means a *later*
    // build starting immediately afterward can't pollute this snapshot even
    // if the settle delay is generous.
    setTimeout(() => {
      void recordCompletedBuild({ sessionId, scenario, prompt, code, auditBlocks: getSessionAuditBlocks(sessionId) })
    }, SERIALIZE_SETTLE_MS)
  }
}

/**
 * Shared connection handler for both the primary `/api/agent/stream`
 * endpoint and the always-spectate `/api/agent/spectate` endpoint (see
 * routes/spectatorStream.ts). Every connection — builder or spectator — is
 * "just" a subscriber to the session-wide broadcast; the only difference is
 * whether this particular call also kicks off `runPipeline()`.
 */
export function serveSessionStream(c: Context, role: SessionRole, sessionId: string, prompt?: string) {
  return streamSSE(c, async (stream) => {
    let eventId = 0
    let closed = false
    stream.onAbort(() => {
      closed = true
      if (role === 'builder') requestAbort(sessionId)
    })

    const send = (event: string, data: unknown) =>
      stream.writeSSE({ event, id: String(eventId++), data: JSON.stringify(data) })

    await send('session_role', { role, sessionId })

    // Seed with whatever's already happened in the current build, then
    // subscribe for live frames — synchronous back-to-back (no `await`
    // between them), so there's no gap a concurrently-broadcast frame could
    // fall through (see sessionManager.ts's subscribe() doc comment).
    const pending: SessionFrame[] = getBacklog()
    let wake = () => {}
    const unsubscribe = subscribe((frame) => {
      pending.push(frame)
      wake()
    })
    stream.onAbort(() => unsubscribe())

    if (role === 'builder') {
      void runPipeline(sessionId, prompt).finally(() => endSession(sessionId))
    }

    while (!closed) {
      while (pending.length > 0) {
        const frame = pending.shift()!
        await send(frame.event, frame.data)
        if (frame.event === 'session_ended') {
          unsubscribe()
          return
        }
      }
      if (closed) return
      await new Promise<void>((resolve) => {
        wake = resolve
        stream.onAbort(resolve)
      })
      wake = () => {}
    }
  })
}

export function agentStreamHandler(c: Context) {
  // Optional: `?prompt=...` opts a claimed builder's Lead Dev stage into
  // additionally synthesizing and streaming a generated_app_payload.
  const prompt = c.req.query('prompt')

  // System Ceiling: every connection is an "API call" against the platform's
  // hard rate limit (see policyEngine.ts / AGENTZ-STUDIO-SDK.md section 6).
  // Checked before claiming a session role at all, so a denial is a plain 429.
  const rateLimit = checkRateLimit()
  if (!rateLimit.allowed) {
    enqueueAuditEvent('rate_limit_denied', { prompt: prompt ?? null, reason: rateLimit.reason }, 'denied')
    return c.json({ error: rateLimit.reason }, 429)
  }

  const { role, sessionId } = claimSession()
  enqueueAuditEvent('stream_connected', { prompt: prompt ?? null, role }, 'allowed', sessionId)

  return serveSessionStream(c, role, sessionId, prompt)
}
