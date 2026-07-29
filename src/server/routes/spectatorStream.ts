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
  // Was `payload: {}` — the only empty audit payload anywhere in this
  // codebase. Still hash-chained correctly either way (JSON.stringify({})
  // is a well-defined input to the hash), but an always-empty payload
  // contributes no content-specific tamper-evidence of its own. `role`
  // matches the field the sibling `stream_connected` event (agentStream.ts)
  // already carries for the builder-role connection.
  emitPipelineEvent({ name: 'spectator_connected', sessionId, audit: { payload: { role: 'spectator' } } })

  return serveSessionStream(c, 'spectator', sessionId)
}
