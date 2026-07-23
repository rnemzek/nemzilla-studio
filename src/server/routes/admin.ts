import type { Context } from 'hono'
import { listVisitorSessions, getVisitorSession, isValidVisitorId } from '../services/visitorTracker.ts'
import { getSessionAuditBlocks } from '../services/auditLedger.ts'
import { listFeedbackForVisitor } from '../services/feedbackStore.ts'

/**
 * Pass C Task 3: the Admin Usage & Session Drawer's data source. There is no
 * real authentication anywhere in this app (every other route — /api/sessions,
 * /api/bible, the audit stream itself — is already a public read), so this
 * is consistent with the existing security posture rather than a regression:
 * access is gated only by discoverability (the CLI's `admin`/`sessions`
 * commands, not linked from any nav), matching the ask's own "hidden
 * shortcut/toggle" framing. Adding real auth would be a materially bigger,
 * unrequested change to a demo app with no user accounts anywhere else.
 */
export function listSessionsAdminHandler(c: Context) {
  return c.json({ sessions: listVisitorSessions() })
}

export function getSessionDetailAdminHandler(c: Context) {
  const visitorId = c.req.param('visitorId')
  if (!isValidVisitorId(visitorId)) return c.json({ error: 'invalid visitorId' }, 400)

  const visitor = getVisitorSession(visitorId)
  if (!visitor) return c.json({ error: 'visitor not found' }, 404)

  const auditBlocks = visitor.pipelineSessionIds
    .flatMap((sessionId) => getSessionAuditBlocks(sessionId))
    .sort((a, b) => a.index - b.index)

  return c.json({ visitor, auditBlocks, feedback: listFeedbackForVisitor(visitorId) })
}
