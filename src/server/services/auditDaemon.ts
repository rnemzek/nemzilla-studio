/**
 * Passive event-bus listener: the SHA-256 Audit Daemon from the UOW-11
 * spec. Appends every audit-tagged pipeline event to the cryptographic
 * audit ledger (auditLedger.ts) — the pipeline no longer calls
 * enqueueAuditEvent() directly. Registers itself on import — see daemons.ts.
 */
import { enqueueAuditEvent } from './auditLedger.ts'
import { onPipelineEvent } from './eventBus.ts'

onPipelineEvent((event) => {
  if (!event.audit) return
  enqueueAuditEvent(event.name, event.audit.payload, event.audit.policyStatus ?? 'allowed', event.sessionId)
})
