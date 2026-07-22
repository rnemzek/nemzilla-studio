import type { Context } from 'hono'
import { isValidSessionId } from '../services/sessionBundleRecorder.ts'
import { enqueueAuditEvent } from '../services/auditLedger.ts'

/**
 * UOW-11 Task 11.6: a synthesized order-entry app (see
 * swarmCodeSynthesizer.ts) reports every order decision back to the parent
 * page over postMessage; sandboxStore.ts relays it here. This is called
 * long after the swarm pipeline session that generated the app has ended
 * (sessionManager's builder lock is already released), so it deliberately
 * calls enqueueAuditEvent() directly rather than going through eventBus.ts —
 * routing it through the pipeline event bus's `broadcast`/`notify` tags
 * would call sessionManager.broadcastFrame() well outside any active
 * session, silently polluting the *next* unrelated build's initial backlog.
 * The audit ledger itself (enqueueAuditEvent) is the right primitive for an
 * independent, post-session event like this one.
 */

const DECISIONS = new Set(['auto_approved', 'hitl_pending', 'hitl_approved', 'hitl_denied', 'auto_denied'])
const DENIED_DECISIONS = new Set(['hitl_denied', 'auto_denied'])
const MAX_TOTAL = 1_000_000

export async function orderEventHandler(c: Context) {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const { sessionId, total, decision } = (body ?? {}) as { sessionId?: string; total?: number; decision?: string }

  if (typeof sessionId !== 'string' || !isValidSessionId(sessionId)) {
    return c.json({ error: 'invalid or missing sessionId' }, 400)
  }
  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0 || total > MAX_TOTAL) {
    return c.json({ error: 'invalid total' }, 400)
  }
  if (typeof decision !== 'string' || !DECISIONS.has(decision)) {
    return c.json({ error: 'invalid decision' }, 400)
  }

  enqueueAuditEvent(
    'order_decision',
    { sessionId, total, decision },
    DENIED_DECISIONS.has(decision) ? 'denied' : 'allowed',
    sessionId,
  )

  return c.json({ success: true })
}
