/**
 * Thin client wrapper around POST /api/feedback, matching sessionBundleClient.ts's
 * plain-fetch pattern for POST-body-driven routes.
 */
import { getVisitor } from './visitorStore.ts'

export type HireAssessment = 'yes' | 'needs_work'

export interface FeedbackInput {
  comment: string
  wouldHire: HireAssessment | null
  advice: string
}

export interface FeedbackResult {
  success: boolean
  githubIssueUrl: string | null
}

export async function submitFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  const visitor = getVisitor()
  const res = await fetch(`${window.location.origin}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      visitorId: visitor.visitorId,
      handle: visitor.handle,
      comment: input.comment.trim() || null,
      wouldHire: input.wouldHire,
      advice: input.advice.trim() || null,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as FeedbackResult
}
