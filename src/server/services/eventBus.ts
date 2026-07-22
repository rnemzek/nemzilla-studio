/**
 * UOW-11 event bus. Previously, agentStream.ts's pipeline (and the
 * spectator/rate-limit connection handlers) called the Audit Ledger, the SSE
 * broadcast, and the session recorder directly — three unrelated concerns
 * hard-wired into one function. Producers now emit one tagged event per
 * occurrence instead: each optional tag (`broadcast`, `audit`, `notify`,
 * `data`) is owned by exactly one passive daemon (see daemons.ts), so adding
 * a new daemon never requires touching the emitter, and the emitter never
 * needs to know which daemons currently exist.
 */

import type { PolicyStatus } from './auditLedger.ts'

export interface PipelineEvent {
  name: string
  sessionId?: string
  /** Present when this event should reach connected SSE clients verbatim as `{ event: name, data: broadcast }` — see broadcastRelay.ts. */
  broadcast?: unknown
  /** Present when this event should be appended to the cryptographic audit ledger — see auditDaemon.ts. */
  audit?: { payload: unknown; policyStatus?: PolicyStatus }
  /** Present when this event should surface as a user-facing notification (toast/HITL alert) — see notifierDaemon.ts. */
  notify?: { type: 'info' | 'warning' | 'error' | 'success'; message: string }
  /** Arbitrary payload for daemons keyed off `name` rather than a shared tag (e.g. Artifact Recorder on `pipeline_completed`). */
  data?: unknown
}

type Listener = (event: PipelineEvent) => void

const listeners = new Set<Listener>()

/** Daemon modules call this once at import time to self-register — see daemons.ts. */
export function onPipelineEvent(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitPipelineEvent(event: PipelineEvent): void {
  for (const listener of listeners) listener(event)
}
