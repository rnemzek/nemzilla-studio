import type { Context } from 'hono'
import { emitPipelineEvent } from '../services/eventBus.ts'
import { isSupportedFormat, parseIngestPayload } from '../services/stackrynFormatParsers.ts'
import { evaluateGovernance } from '../services/stackrynGovernanceEngine.ts'

/**
 * UOW-1.0: `/api/stackryn/ingest` — accepts a multi-format scoping request,
 * parses it, and evaluates it against the Governance Policy Engine. Each
 * stage is emitted as a tagged PipelineEvent so the existing daemons pick it
 * up for free: `broadcast` reaches `/api/agent/stream` (broadcastRelay.ts),
 * `audit` reaches the Cryptographic Audit Ledger (auditDaemon.ts). No new
 * wiring needed for either — see eventBus.ts's doc comment.
 */
export async function stackrynIngestHandler(c: Context) {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const { format, filename, payload } = (body ?? {}) as { format?: string; filename?: string; payload?: string }

  if (!isSupportedFormat(format)) {
    return c.json({ error: 'invalid or missing format (expected "pdf", "csv", or "txt")' }, 400)
  }
  if (typeof filename !== 'string' || !filename) {
    return c.json({ error: 'invalid or missing filename' }, 400)
  }
  if (typeof payload !== 'string' || !payload) {
    return c.json({ error: 'invalid or missing payload' }, 400)
  }

  const sessionId = crypto.randomUUID()
  const step = (state: 'PLANNING' | 'PARSING' | 'EVALUATING' | 'DONE', extra?: Record<string, unknown>) =>
    emitPipelineEvent({
      name: 'agent_step',
      sessionId,
      broadcast: { agent: 'Stackryn Ingest', state, filename, timestamp: new Date().toISOString(), ...extra },
    })

  step('PLANNING')

  const parsed = parseIngestPayload(format, filename, payload)
  step('PARSING', { format: parsed.format, recordCount: parsed.recordCount })

  step('EVALUATING')
  const result = evaluateGovernance(parsed)

  emitPipelineEvent({
    name: 'agent_step',
    sessionId,
    broadcast: { agent: 'Stackryn Ingest', state: 'DONE', filename, timestamp: new Date().toISOString(), policyStatus: result.policyStatus },
    audit: { payload: result, policyStatus: result.policyStatus },
  })

  if (result.policyStatus === 'denied') {
    return c.json({ success: false, result }, 422)
  }

  return c.json({ success: true, result })
}
