/**
 * Thin client wrapper around POST /api/stackryn/ingest, matching
 * pingClient.ts/feedbackClient.ts's plain-fetch pattern for POST-body-driven
 * routes (the typed apiClient.ts RPC client is only ever used for $get calls
 * elsewhere in this codebase — see swarmStore.ts/terminalCommands.ts).
 */
import type { StackrynIngestPreset } from './cookbookPresets.ts'

export interface StackrynIngestResult {
  filename: string
  format: 'pdf' | 'csv' | 'txt'
  recordCount: number
  fields: string[]
  policyStatus: 'allowed' | 'denied' | 'clamped'
  reason?: string
}

export async function triggerStackrynIngest(preset: StackrynIngestPreset): Promise<StackrynIngestResult> {
  const res = await fetch(`${window.location.origin}/api/stackryn/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: preset.format, filename: preset.filename, payload: preset.payload }),
  })
  const body = (await res.json().catch(() => null)) as { result?: StackrynIngestResult; error?: string } | null
  if (!res.ok && res.status !== 422) {
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }
  if (!body?.result) throw new Error('stackryn ingest: malformed response')
  return body.result
}
