import type { Context } from 'hono'
import { serveSessionStream } from '../services/agentStream.ts'
import { checkRateLimit } from '../services/policyEngine.ts'
import { emitPipelineEvent } from '../services/eventBus.ts'

/**
 * Always-spectate endpoint — never attempts to claim the builder role, so a
 * pure-visualization consumer (SwarmCanvas) can never accidentally win the
 * single-active-builder race and run an unprompted pipeline itself. It just
 * observes whatever build is currently active (or waits idly if none is).
 */
export function spectatorStreamHandler(c: Context) {
  const rateLimit = checkRateLimit()
  if (!rateLimit.allowed) {
    emitPipelineEvent({ name: 'rate_limit_denied', audit: { payload: { prompt: null, reason: rateLimit.reason }, policyStatus: 'denied' } })
    return c.json({ error: rateLimit.reason }, 429)
  }

  const sessionId = crypto.randomUUID()
  emitPipelineEvent({ name: 'spectator_connected', sessionId, audit: { payload: {} } })

  return serveSessionStream(c, 'spectator', sessionId)
}
