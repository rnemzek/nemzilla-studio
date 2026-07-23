/**
 * Pass C Task 2: persists visitor feedback (a comment and/or a "would you
 * hire me?" assessment). Same shape as auditLedger.ts's own persistence —
 * JSON lines under `.codex/feedback/`, plus a bounded in-memory list for the
 * Admin Drawer and Session Detail view to read without round-tripping to
 * disk on every request.
 */
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export type HireAssessment = 'yes' | 'needs_work'

export interface FeedbackEntry {
  id: string
  timestamp: string
  visitorId: string
  handle: string
  comment: string | null
  wouldHire: HireAssessment | null
  advice: string | null
  githubIssueUrl: string | null
}

const FEEDBACK_DIR = path.join(process.cwd(), '.codex', 'feedback')
const MAX_IN_MEMORY = 500

const entries: FeedbackEntry[] = []

function feedbackFilePath(date: Date): string {
  const day = date.toISOString().slice(0, 10)
  return path.join(FEEDBACK_DIR, `feedback-${day}.jsonl`)
}

export async function recordFeedback(input: Omit<FeedbackEntry, 'id' | 'timestamp'>): Promise<FeedbackEntry> {
  const entry: FeedbackEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...input,
  }

  entries.push(entry)
  if (entries.length > MAX_IN_MEMORY) entries.shift()

  try {
    await mkdir(FEEDBACK_DIR, { recursive: true })
    await appendFile(feedbackFilePath(new Date(entry.timestamp)), JSON.stringify(entry) + '\n', 'utf8')
  } catch (err) {
    console.error('feedbackStore: failed to persist feedback entry', err)
  }

  return entry
}

export function listFeedback(): FeedbackEntry[] {
  return [...entries]
}

export function listFeedbackForVisitor(visitorId: string): FeedbackEntry[] {
  return entries.filter((entry) => entry.visitorId === visitorId)
}
