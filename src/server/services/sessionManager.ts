/**
 * Enforces the "single-active builder" model from .codex/AGENTZ-STUDIO-SDK.md:
 * exactly one agent pipeline execution runs server-wide at a time. The first
 * connection while no build is active claims the builder role and actually
 * drives the pipeline (see agentStream.ts's runPipeline); every other
 * connection — a second browser tab, a Cookbook launch while one's already
 * running, a spectator — becomes a read-only observer of that same run via
 * broadcastFrame/subscribe, rather than starting a parallel pipeline.
 */

export type SessionRole = 'builder' | 'spectator'

export interface SessionFrame {
  event: string
  data: unknown
}

interface ActiveSession {
  sessionId: string
  aborted: boolean
}

let active: ActiveSession | null = null
let backlog: SessionFrame[] = []
const subscribers = new Set<(frame: SessionFrame) => void>()

export function isBuildActive(): boolean {
  return active !== null
}

export function getActiveBuilderId(): string | null {
  return active?.sessionId ?? null
}

/** Attempts to claim the builder role for a brand-new connection. */
export function claimSession(): { role: SessionRole; sessionId: string } {
  if (active) {
    return { role: 'spectator', sessionId: crypto.randomUUID() }
  }
  const sessionId = crypto.randomUUID()
  active = { sessionId, aborted: false }
  backlog = []
  return { role: 'builder', sessionId }
}

/** Called when the builder's own connection aborts early — stops the shared run for everyone. */
export function requestAbort(sessionId: string): void {
  if (active?.sessionId === sessionId) active.aborted = true
}

/** True once this session should stop driving the pipeline (aborted, or superseded by a newer session). */
export function isAborted(sessionId: string): boolean {
  return active?.sessionId !== sessionId || active.aborted
}

export function broadcastFrame(event: string, data: unknown): void {
  const frame: SessionFrame = { event, data }
  backlog.push(frame)
  for (const notify of subscribers) notify(frame)
}

export function getBacklog(): SessionFrame[] {
  return [...backlog]
}

/**
 * Subscribes to live frames. Callers should seed their own initial state from
 * `getBacklog()` *before* calling this (both synchronous, no `await` between
 * them — Node's run-to-completion semantics make that atomic, so there's no
 * gap where a concurrently-broadcast frame is neither in the snapshot nor
 * caught by the subscriber).
 */
export function subscribe(cb: (frame: SessionFrame) => void): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

/** Releases the builder lock and notifies everyone the run has ended. Safe to call more than once. */
export function endSession(sessionId: string): void {
  if (active?.sessionId !== sessionId) return
  active = null
  broadcastFrame('session_ended', { sessionId })
  backlog = []
}
