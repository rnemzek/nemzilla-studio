import type { Context } from 'hono'
import { recordFeedback, listFeedback, type HireAssessment } from '../services/feedbackStore.ts'
import { isValidVisitorId, sanitizeHandle, touchVisitor, addMilestone } from '../services/visitorTracker.ts'
import { createFeedbackIssue, isGithubIssuesConfigured } from '../services/githubIssueClient.ts'
import { sendHighValueAlert } from '../services/webhookNotifier.ts'

const MAX_COMMENT_LENGTH = 2000
const MAX_ADVICE_LENGTH = 1000
const HIRE_VALUES = new Set<HireAssessment>(['yes', 'needs_work'])

const HIRE_LABEL: Record<HireAssessment, string> = {
  yes: 'Yes',
  needs_work: 'Needs Work',
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

export async function submitFeedbackHandler(c: Context) {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const { visitorId, handle, comment, wouldHire, advice } = (body ?? {}) as {
    visitorId?: string
    handle?: string
    comment?: string | null
    wouldHire?: string | null
    advice?: string | null
  }

  if (!isValidVisitorId(visitorId)) return c.json({ error: 'invalid visitorId' }, 400)
  if (comment != null && (typeof comment !== 'string' || comment.length > MAX_COMMENT_LENGTH)) {
    return c.json({ error: 'invalid comment' }, 400)
  }
  if (advice != null && (typeof advice !== 'string' || advice.length > MAX_ADVICE_LENGTH)) {
    return c.json({ error: 'invalid advice' }, 400)
  }
  if (wouldHire != null && !HIRE_VALUES.has(wouldHire as HireAssessment)) {
    return c.json({ error: 'invalid wouldHire' }, 400)
  }
  if (!isNonEmptyString(comment) && wouldHire == null) {
    return c.json({ error: 'feedback must include a comment or a hire assessment' }, 400)
  }

  const safeHandle = sanitizeHandle(handle)
  const trimmedComment = isNonEmptyString(comment) ? comment.trim() : null
  const trimmedAdvice = isNonEmptyString(advice) ? advice.trim() : null
  const hireAssessment = (wouldHire as HireAssessment | null) ?? null

  let githubIssueUrl: string | null = null
  if (isGithubIssuesConfigured()) {
    const title = `Feedback from ${safeHandle}${hireAssessment ? ` — ${HIRE_LABEL[hireAssessment]}` : ''}`
    const bodyLines = [
      trimmedComment ? `**Comment:**\n${trimmedComment}` : null,
      hireAssessment ? `**Would hire?** ${HIRE_LABEL[hireAssessment]}` : null,
      trimmedAdvice ? `**Advice:**\n${trimmedAdvice}` : null,
      `\n_Visitor: ${safeHandle} (${visitorId})_`,
    ].filter(Boolean)
    githubIssueUrl = await createFeedbackIssue(title, bodyLines.join('\n\n'))
  }

  const entry = await recordFeedback({
    visitorId,
    handle: safeHandle,
    comment: trimmedComment,
    wouldHire: hireAssessment,
    advice: trimmedAdvice,
    githubIssueUrl,
  })

  touchVisitor(visitorId, safeHandle)
  addMilestone(visitorId, 'Feedback Submitted')

  if (hireAssessment) {
    sendHighValueAlert(
      `🎯 High-intent feedback from ${safeHandle}: "Would you hire/partner with me?" → ${HIRE_LABEL[hireAssessment]}`,
      { visitorId, handle: safeHandle, wouldHire: hireAssessment, comment: trimmedComment, advice: trimmedAdvice },
    )
  }

  return c.json({ success: true, id: entry.id, githubIssueUrl })
}

export function listFeedbackHandler(c: Context) {
  return c.json({ feedback: listFeedback() })
}
