/**
 * Pass C: in-memory registry of visitor sessions, powering the Admin Usage &
 * Session Drawer. A "visitor" is a browser (visitorStore.ts's hashed
 * `visitorId`, persisted client-side in localStorage), distinct from a
 * pipeline run's own `sessionId` (sessionManager.ts's ephemeral builder-lock
 * id, or the PO interview's own persistent session id) — one visitor can
 * accumulate many pipeline sessions over time, which is exactly what
 * `pipelineSessionIds` correlates so the Session Detail view can pull that
 * visitor's *entire* audit trail via `getSessionAuditBlocks()`, not just
 * their most recent run.
 *
 * Deliberately in-memory only (mirrors sessionManager.ts's builder lock) —
 * this is operator telemetry for a live demo, not a durable user database.
 */

export type Milestone = 'PO Interview' | 'Swarm Executed' | 'Feedback Submitted' | 'App Published'

export interface VisitorSession {
  visitorId: string
  handle: string
  firstSeen: string
  lastSeen: string
  milestones: Milestone[]
  pipelineSessionIds: string[]
}

interface VisitorRecord {
  visitorId: string
  handle: string
  firstSeen: number
  lastSeen: number
  milestones: Set<Milestone>
  pipelineSessionIds: Set<string>
}

/** Our own lightweight hashed-id format (visitorStore.ts: sha256(userAgent + token).slice(0, 16)) — not a UUID. */
const VISITOR_ID_PATTERN = /^[0-9a-f]{8,32}$/i
const MAX_HANDLE_LENGTH = 60
const MAX_TRACKED_VISITORS = 500

const visitors = new Map<string, VisitorRecord>()

export function isValidVisitorId(v: unknown): v is string {
  return typeof v === 'string' && VISITOR_ID_PATTERN.test(v)
}

export function sanitizeHandle(handle: unknown): string {
  if (typeof handle !== 'string') return 'Anonymous Visitor'
  const trimmed = handle.trim().slice(0, MAX_HANDLE_LENGTH)
  return trimmed || 'Anonymous Visitor'
}

/** Evicts the least-recently-seen visitor once at capacity — bounds memory the same way auditLedger.ts's chain cap does. */
function evictIfAtCapacity(): void {
  if (visitors.size < MAX_TRACKED_VISITORS) return
  let oldestId: string | null = null
  let oldestSeen = Infinity
  for (const [id, record] of visitors) {
    if (record.lastSeen < oldestSeen) {
      oldestSeen = record.lastSeen
      oldestId = id
    }
  }
  if (oldestId) visitors.delete(oldestId)
}

export function touchVisitor(visitorId: string, handle: string): void {
  const existing = visitors.get(visitorId)
  const now = Date.now()
  if (existing) {
    existing.lastSeen = now
    existing.handle = handle
    return
  }
  evictIfAtCapacity()
  visitors.set(visitorId, {
    visitorId,
    handle,
    firstSeen: now,
    lastSeen: now,
    milestones: new Set(),
    pipelineSessionIds: new Set(),
  })
}

export function addMilestone(visitorId: string, milestone: Milestone): void {
  const record = visitors.get(visitorId)
  if (!record) return
  record.milestones.add(milestone)
  record.lastSeen = Date.now()
}

export function linkPipelineSession(visitorId: string, sessionId: string): void {
  const record = visitors.get(visitorId)
  if (!record) return
  record.pipelineSessionIds.add(sessionId)
  record.lastSeen = Date.now()
}

function toPublicSession(record: VisitorRecord): VisitorSession {
  return {
    visitorId: record.visitorId,
    handle: record.handle,
    firstSeen: new Date(record.firstSeen).toISOString(),
    lastSeen: new Date(record.lastSeen).toISOString(),
    milestones: Array.from(record.milestones),
    pipelineSessionIds: Array.from(record.pipelineSessionIds),
  }
}

/** Chronological, most-recently-active first — what the Admin Drawer's Session List view renders. */
export function listVisitorSessions(): VisitorSession[] {
  return Array.from(visitors.values())
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map(toPublicSession)
}

export function getVisitorSession(visitorId: string): VisitorSession | null {
  const record = visitors.get(visitorId)
  return record ? toPublicSession(record) : null
}
