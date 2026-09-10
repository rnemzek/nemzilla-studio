/**
 * Thin client wrapper around POST /api/stackryn/ingest, matching
 * pingClient.ts/feedbackClient.ts's plain-fetch pattern for POST-body-driven
 * routes (the typed apiClient.ts RPC client is only ever used for $get calls
 * elsewhere in this codebase — see swarmStore.ts/terminalCommands.ts).
 */
import type { StackrynIngestPreset } from './cookbookPresets.ts'

export interface ModernizationMetrics {
  totalRequirements: number
  systemsMapped: number
  fitScorePercentage: number
  estimatedCostRangeUsd: { min: number; max: number }
  estimatedDurationWeeks: { min: number; max: number }
}

export type RiskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM'

export interface ModernizationRisk {
  severity: RiskSeverity
  title: string
  recommendation: string
}

export interface LinearIssue {
  title: string
  labels: string[]
  priority: 1 | 2 | 3 | 4
  descriptionMarkdown: string
}

export interface LinearExportPayload {
  project: string
  epics: string[]
  issues: LinearIssue[]
}

export interface StackrynIngestResult {
  filename: string
  format: 'pdf' | 'csv' | 'txt' | 'json'
  recordCount: number
  fields: string[]
  policyStatus: 'allowed' | 'denied' | 'clamped'
  reason?: string
  projectId?: string
  projectName?: string
  metrics?: ModernizationMetrics
  risks?: ModernizationRisk[]
  linearExport?: LinearExportPayload
}

export interface StackrynIngestResponse {
  result: StackrynIngestResult
  auditHash?: string
}

async function postStackrynIngest(body: BodyInit, headers?: HeadersInit): Promise<StackrynIngestResponse> {
  const res = await fetch(`${window.location.origin}/api/stackryn/ingest`, { method: 'POST', headers, body })
  const parsed = (await res.json().catch(() => null)) as { result?: StackrynIngestResult; auditHash?: string; error?: string } | null
  if (!res.ok && res.status !== 422) {
    throw new Error(parsed?.error ?? `HTTP ${res.status}`)
  }
  if (!parsed?.result) throw new Error('stackryn ingest: malformed response')
  return { result: parsed.result, auditHash: parsed.auditHash }
}

export function triggerStackrynIngest(preset: StackrynIngestPreset): Promise<StackrynIngestResponse> {
  return postStackrynIngest(JSON.stringify({ format: preset.format, filename: preset.filename, payload: preset.payload }), {
    'Content-Type': 'application/json',
  })
}

/** UOW-4.0: FileUploadZone.tsx's drag-and-drop path — the server infers `format` from the filename extension (see inferFormatFromFilename in stackrynFormatParsers.ts). */
export function triggerStackrynFileUpload(file: File): Promise<StackrynIngestResponse> {
  const formData = new FormData()
  formData.append('file', file)
  return postStackrynIngest(formData)
}
