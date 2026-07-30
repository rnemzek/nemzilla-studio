import type { Context } from 'hono'
import { isValidVisitorId } from '../services/visitorTracker.ts'
import { sendHighValueAlert } from '../services/webhookNotifier.ts'

const MAX_MESSAGE_LENGTH = 1000

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * "Ping Dev" — a direct line from any visitor straight to the operator's
 * webhook (Discord/Slack, see webhookNotifier.ts's WEBHOOK_URL), separate
 * from FeedbackModal's structured comment/hire-assessment flow. Always
 * best-effort: sendHighValueAlert() silently no-ops when WEBHOOK_URL isn't
 * configured, same as every other caller of it.
 */
export async function pingDevHandler(c: Context) {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const { message, sessionId } = (body ?? {}) as { message?: string; sessionId?: string }

  if (!isNonEmptyString(message) || message.length > MAX_MESSAGE_LENGTH) {
    return c.json({ error: 'invalid message' }, 400)
  }
  if (sessionId !== undefined && !isValidVisitorId(sessionId)) {
    return c.json({ error: 'invalid sessionId' }, 400)
  }

  sendHighValueAlert(`📡 Dev ping: "${message.trim()}"`, { sessionId: sessionId ?? null })

  return c.json({ success: true })
}
