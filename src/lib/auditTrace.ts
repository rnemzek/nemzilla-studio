import type { AuditBlock } from './auditStore.ts'

/** Shared one-line formatter for an audit block — ArtifactsPanel.tsx's Agent Trace tab and AdminDrawer.tsx's Session Detail view both render off this, so the two views never drift on how a given action reads. */
export function formatAuditLine(block: AuditBlock): string {
  const payload = (block.payload ?? {}) as Record<string, unknown>
  switch (block.action) {
    case 'agent_step':
      return `[${payload.agent}] ${payload.state}`
    case 'policy_check':
      return `Policy check (${payload.type ?? 'unknown'}) — ${block.policyStatus}${
        typeof payload.value === 'number' ? ` → $${payload.value}` : ''
      }`
    case 'generated_app_payload':
      return `Synthesized app code — ${payload.scenario ?? 'unknown scenario'} (${payload.size ?? '?'} bytes)`
    case 'po_interview_turn':
      return `PO turn — ${payload.userMessage ? `you: "${payload.userMessage}" → ` : ''}PO: "${payload.reply}"`
    case 'pipeline_completed':
      return 'Pipeline completed'
    case 'stream_connected':
      return `Stream connected (role: ${payload.role ?? 'unknown'})`
    case 'order_decision':
      return `Order decision: ${payload.decision} ($${payload.total})`
    default:
      return block.action
  }
}
