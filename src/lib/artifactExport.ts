/**
 * UAT fix: "📋 Copy Debug Artifacts" — aggregates the current PO hand-off
 * state, recent Audit Ledger entries, and the active swarm session's
 * metadata into one Markdown document a visitor can paste directly into a
 * bug report or support message, rather than having to screenshot three
 * separate panels. Reads the same three reactive stores the Studio's own
 * panels already render from (interviewStore.ts, auditStore.ts,
 * sandboxStore.ts) — this module never duplicates or re-fetches anything.
 */
import { interviewState } from './interviewStore.ts'
import { auditStore } from './auditStore.ts'
import { sandboxStore } from './sandboxStore.ts'

const MAX_AUDIT_ENTRIES = 20

function formatPoHandoff(): string {
  const interview = interviewState.interview
  if (!interview) return '_No PO interview has been started yet._'
  const payload = {
    sessionId: interview.sessionId,
    done: interview.done,
    vendorName: interview.vendorName,
    hitlThreshold: interview.hitlThreshold,
    catalog: interview.catalog,
  }
  return '```json\n' + JSON.stringify(payload, null, 2) + '\n```'
}

function formatAuditLog(): string {
  const blocks = auditStore.state.blocks.slice(-MAX_AUDIT_ENTRIES)
  if (blocks.length === 0) return '_No audit ledger entries yet._'
  const lines = blocks.map(
    (block) => `#${block.index} [${block.policyStatus}] ${block.action} @ ${block.timestamp}\n${JSON.stringify(block.payload)}`,
  )
  return '```\n' + lines.join('\n\n') + '\n```'
}

function formatSwarmSession(): string {
  const payload = {
    status: sandboxStore.state.status,
    tab: sandboxStore.state.tab,
    codeLength: sandboxStore.state.code.length,
    errorMessage: sandboxStore.state.errorMessage,
  }
  return '```json\n' + JSON.stringify(payload, null, 2) + '\n```'
}

export function buildDebugArtifactsMarkdown(): string {
  return [
    '# AgentZ Debug Artifacts',
    '',
    `_Captured ${new Date().toISOString()}_`,
    '',
    '## PO Hand-off State',
    formatPoHandoff(),
    '',
    '## Active Swarm Session',
    formatSwarmSession(),
    '',
    `## Audit Ledger (last ${MAX_AUDIT_ENTRIES})`,
    formatAuditLog(),
    '',
  ].join('\n')
}

/** Best-effort — a failed clipboard write (e.g. no permission in a headless/embedded context) is logged but never surfaced as a hard error. */
export async function copyDebugArtifacts(): Promise<boolean> {
  const markdown = buildDebugArtifactsMarkdown()
  try {
    await navigator.clipboard.writeText(markdown)
    return true
  } catch (err) {
    console.error('artifactExport: clipboard write failed', err)
    return false
  }
}
