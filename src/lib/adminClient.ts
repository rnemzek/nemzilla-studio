import type { AuditBlock } from './auditStore.ts'

export interface AdminVisitorSession {
  visitorId: string
  handle: string
  firstSeen: string
  lastSeen: string
  milestones: string[]
  pipelineSessionIds: string[]
}

export interface AdminFeedbackEntry {
  id: string
  timestamp: string
  visitorId: string
  handle: string
  comment: string | null
  wouldHire: 'yes' | 'needs_work' | null
  advice: string | null
  githubIssueUrl: string | null
}

export interface AdminSessionDetail {
  visitor: AdminVisitorSession
  auditBlocks: AuditBlock[]
  feedback: AdminFeedbackEntry[]
}

export async function listAdminSessions(): Promise<AdminVisitorSession[]> {
  const res = await fetch(`${window.location.origin}/api/admin/sessions`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = (await res.json()) as { sessions: AdminVisitorSession[] }
  return body.sessions
}

export async function getAdminSessionDetail(visitorId: string): Promise<AdminSessionDetail> {
  const res = await fetch(`${window.location.origin}/api/admin/sessions/${encodeURIComponent(visitorId)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as AdminSessionDetail
}
