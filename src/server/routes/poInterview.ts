import type { Context } from 'hono'
import { runPoInterviewTurn, type PoKnownFields, type PoTranscriptEntry } from '../services/poInterviewLLM.ts'

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

  const { transcript, known, userMessage } = (body ?? {}) as { transcript?: unknown; known?: unknown; userMessage?: unknown }

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
    return c.json(result)
  } catch (err) {
    console.error('poInterviewHandler: LLM call failed', err)
    return c.json({ error: 'llm_unavailable' }, 502)
  }
}
