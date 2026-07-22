import type { Context } from 'hono'
import { serveSessionStream } from '../services/agentStream.ts'
import { checkRateLimit } from '../services/policyEngine.ts'
import { enqueueAuditEvent } from '../services/auditLedger.ts'

/**
 * Always-spectate endpoint — never attempts to claim the builder role, so a
 * pure-visualization consumer (SwarmCanvas) can never accidentally win the
 * single-active-builder race and run an unprompted pipeline itself. It just
 * observes whatever build is currently active (or waits idly if none is).
 */
export function spectatorStreamHandler(c: Context) {
  const rateLimit = checkRateLimit()
  if (!rateLimit.allowed) {
    enqueueAuditEvent('rate_limit_denied', { prompt: null, reason: rateLimit.reason }, 'denied')
    return c.json({ error: rateLimit.reason }, 429)
  }

  const sessionId = crypto.randomUUID()
  enqueueAuditEvent('spectator_connected', {}, 'allowed', sessionId)

  return serveSessionStream(c, 'spectator', sessionId)
}
