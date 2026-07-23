import type { Context } from 'hono'
import { runPoInterviewTurn, SYSTEM_PROMPT, type PoKnownFields, type PoTranscriptEntry } from '../services/poInterviewLLM.ts'
import { classifyAnthropicError, type LlmErrorCategory } from '../services/anthropicClient.ts'
import { isValidSessionId } from '../services/sessionBundleRecorder.ts'
import { isValidVisitorId, sanitizeHandle, touchVisitor, linkPipelineSession, addMilestone } from '../services/visitorTracker.ts'
import { enqueueAuditEvent } from '../services/auditLedger.ts'

/** Maps each diagnosed failure category to the HTTP status returned to the client — distinct enough to tell "not configured" (503, an operator problem) apart from a transient upstream failure (502, might work on retry) from the browser's network tab alone. */
const STATUS_BY_CATEGORY = {
  not_configured: 503,
  authentication: 503,
  rate_limited: 502,
  connection: 502,
  api_error: 502,
  unknown: 502,
} as const satisfies Record<LlmErrorCategory, number>

/**
 * UOW-13: every request here is a real, billed Anthropic API call — unlike
 * the rest of this app's simulated pipeline, this endpoint has a genuine
 * per-call cost. It has no existing rate gate to piggyback on (the
 * /api/agent/stream limiter in policyEngine.ts is scoped to that pipeline's
 * single-active-builder model), so this is a small dedicated sliding-window
 * limiter — the same shape, kept separate rather than generalizing
 * policyEngine.ts for a single new caller.
 */
const MAX_CALLS_PER_MINUTE = 20
const RATE_WINDOW_MS = 60_000
const requestTimestamps: number[] = []

function checkPoInterviewRateLimit(now: number = Date.now()): boolean {
  while (requestTimestamps.length > 0 && now - requestTimestamps[0]! > RATE_WINDOW_MS) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= MAX_CALLS_PER_MINUTE) return false
  requestTimestamps.push(now)
  return true
}

const MAX_TRANSCRIPT_LENGTH = 200
const MAX_MESSAGE_LENGTH = 2000

function isValidTranscript(v: unknown): v is PoTranscriptEntry[] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        e !== null &&
        typeof e === 'object' &&
        ((e as Record<string, unknown>).role === 'po' || (e as Record<string, unknown>).role === 'user') &&
        typeof (e as Record<string, unknown>).message === 'string' &&
        typeof (e as Record<string, unknown>).timestamp === 'string',
    )
  )
}

function isValidKnown(v: unknown): v is PoKnownFields {
  if (v === null || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  if (d.vendorName !== null && typeof d.vendorName !== 'string') return false
  if (d.hitlThreshold !== null && typeof d.hitlThreshold !== 'number') return false
  if (d.catalog !== null && !Array.isArray(d.catalog)) return false
  return true
}

/**
 * Read-only introspection for the Artifacts/Telemetry deck's "Prompt &
 * Payload Inspector" (Pass A) — the actual system prompt driving the AI PO,
 * not a hand-copied duplicate that could drift from what the model really
 * sees. Never includes the API key or any request-specific data.
 */
export function poInterviewMetaHandler(c: Context) {
  return c.json({ systemPrompt: SYSTEM_PROMPT })
}

export async function poInterviewHandler(c: Context) {
  if (!checkPoInterviewRateLimit()) {
    return c.json({ error: `rate limit exceeded — max ${MAX_CALLS_PER_MINUTE} calls/min` }, 429)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const { transcript, known, userMessage, sessionId, visitorId, handle } = (body ?? {}) as {
    transcript?: unknown
    known?: unknown
    userMessage?: unknown
    sessionId?: unknown
    visitorId?: unknown
    handle?: unknown
  }

  if (!isValidTranscript(transcript) || transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return c.json({ error: 'invalid transcript' }, 400)
  }
  if (!isValidKnown(known)) {
    return c.json({ error: 'invalid known fields' }, 400)
  }
  if (userMessage !== null && userMessage !== undefined && (typeof userMessage !== 'string' || userMessage.length > MAX_MESSAGE_LENGTH)) {
    return c.json({ error: 'invalid userMessage' }, 400)
  }

  try {
    const result = await runPoInterviewTurn(transcript, known, typeof userMessage === 'string' ? userMessage : null)

    // Pass C: correlates this interview to a visitor and audit-logs the turn
    // in real time (tagged by the interview's own sessionId, the same field
    // swarm pipeline runs use) — so the Admin Drawer's Session Detail view
    // can show "every prompt typed, PO response" via the exact same
    // getSessionAuditBlocks() query it uses for swarm telemetry, with no
    // separate storage path. Optional: an old/incognito client that doesn't
    // send these just isn't tracked — the interview itself still works.
    if (typeof sessionId === 'string' && isValidSessionId(sessionId) && isValidVisitorId(visitorId)) {
      const safeHandle = sanitizeHandle(handle)
      touchVisitor(visitorId, safeHandle)
      linkPipelineSession(visitorId, sessionId)
      enqueueAuditEvent(
        'po_interview_turn',
        { visitorId, handle: safeHandle, userMessage: typeof userMessage === 'string' ? userMessage.slice(0, 500) : null, reply: result.reply.slice(0, 1000) },
        'allowed',
        sessionId,
      )
      if (result.done) addMilestone(visitorId, 'PO Interview')
    }

    return c.json(result)
  } catch (err) {
    const { category, logMessage } = classifyAnthropicError(err)
    console.error(`poInterviewHandler: LLM call failed [${category}] — ${logMessage}`)
    return c.json({ error: `llm_${category}` }, STATUS_BY_CATEGORY[category])
  }
}
