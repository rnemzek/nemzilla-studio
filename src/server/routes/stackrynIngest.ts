import type { Context } from 'hono'
import { emitPipelineEvent } from '../services/eventBus.ts'
import { inferFormatFromFilename, isSupportedFormat, parseIngestPayload } from '../services/stackrynFormatParsers.ts'
import { evaluateGovernance } from '../services/stackrynGovernanceEngine.ts'
import { getChainBacklog } from '../services/auditLedger.ts'

/** UOW-4.0: pulls `{ format, filename, payload }` out of either a JSON preset body or a multipart file upload (FileUploadZone.tsx) — the two request shapes the client sends. */
async function readIngestRequest(
  c: Context,
): Promise<{ format?: string; filename?: string; payload?: string } | { error: string }> {
  const contentType = c.req.header('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    let body: Record<string, string | File>
    try {
      body = await c.req.parseBody()
    } catch {
      return { error: 'invalid multipart form data' }
    }
    const file = body.file
    if (!(file instanceof File)) {
      return { error: 'missing "file" field in multipart upload' }
    }
    const format = inferFormatFromFilename(file.name)
    if (!format) {
      return { error: 'unsupported file extension (expected .pdf, .csv, .txt, or .json)' }
    }
    return { format, filename: file.name, payload: await file.text() }
  }

  try {
    return (await c.req.json()) ?? {}
  } catch {
    return { error: 'invalid JSON body' }
  }
}

/**
 * UOW-1.0: `/api/stackryn/ingest` — accepts a multi-format scoping request,
 * parses it, and evaluates it against the Governance Policy Engine. Each
 * stage is emitted as a tagged PipelineEvent so the existing daemons pick it
 * up for free: `broadcast` reaches `/api/agent/stream` (broadcastRelay.ts),
 * `audit` reaches the Cryptographic Audit Ledger (auditDaemon.ts). No new
 * wiring needed for either — see eventBus.ts's doc comment.
 */
export async function stackrynIngestHandler(c: Context) {
  const parsedRequest = await readIngestRequest(c)
  if ('error' in parsedRequest) {
    return c.json({ error: parsedRequest.error }, 400)
  }
  const { format, filename, payload } = parsedRequest

  if (!isSupportedFormat(format)) {
    return c.json({ error: 'invalid or missing format (expected "pdf", "csv", "txt", or "json")' }, 400)
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

  // The audit daemon drains via setImmediate (see auditLedger.ts) — it was
  // already scheduled by the emitPipelineEvent() call above, so yielding one
  // tick here is enough for `chain.push(block)` to have run (that happens
  // synchronously at the top of the daemon's drain loop, before its own
  // `await persistBlock()`) by the time this resolves.
  await new Promise((resolve) => setImmediate(resolve))
  // Scanned rather than assumed-latest: the classic/swarm demo pipelines run
  // concurrently and append their own audit blocks continuously, so this
  // ingest's own block isn't guaranteed to be the single most recent one.
  const auditHash = getChainBacklog(20)
    .reverse()
    .find((block) => block.action === 'agent_step' && block.sessionId === sessionId)?.hash

  if (result.policyStatus === 'denied') {
    return c.json({ success: false, result, auditHash }, 422)
  }

  return c.json({ success: true, result, auditHash })
}
