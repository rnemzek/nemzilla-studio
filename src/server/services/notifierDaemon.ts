/**
 * Passive event-bus listener: the Notification Engine daemon from the
 * UOW-11 spec. Turns notify-tagged pipeline events (a generation refusal, a
 * clamped policy threshold, a completed build) into a normalized
 * `notification` SSE frame. No client UI consumes this yet — that's Phase 2/
 * 3 (toasts/HITL modals) — but the daemon side of the wire is live now, so
 * later UOW-11 tasks only need to add a listener, not another producer.
 * Registers itself on import — see daemons.ts.
 */
import { broadcastFrame } from './sessionManager.ts'
import { onPipelineEvent } from './eventBus.ts'

onPipelineEvent((event) => {
  if (!event.notify) return
  broadcastFrame('notification', {
    ...event.notify,
    sessionId: event.sessionId,
    timestamp: new Date().toISOString(),
  })
})
