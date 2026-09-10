/**
 * UOW-3.0: pivoted from the flat `IngestedScopePayload` (UOW-1.0/2.0) to a
 * full `ModernizationDashboardPayload` for the "Project Horizon" enterprise
 * modernization scoping scenario — see fixtures/stackryn/*.
 *
 * The System Ceiling checks below are the only part of this evaluation that
 * genuinely varies per request (rate limit / forbidden operations, same as
 * every other governed action — see policyEngine.ts). The project-level
 * metrics/risks/Linear export are the scoping engagement's own known
 * findings, not something derivable from a single uploaded document — same
 * "canned scenario data" precedent as COOKBOOK_PRESETS/synthesizeOrderEntryApp
 * elsewhere in this codebase. Only `systemsMapped` is cross-checked against
 * the actual ingested record count when a CSV inventory is the file being
 * evaluated, so it doesn't silently drift from fixtures/stackryn/system-matrix.csv.
 */

import type { PolicyStatus } from './auditLedger.ts'
import { checkForbiddenOperation, checkRateLimit } from './policyEngine.ts'
import type { ParsedIngestPayload } from './stackrynFormatParsers.ts'

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
  /** Linear's own scale: 1 = Urgent, 2 = High, 3 = Medium, 4 = Low. */
  priority: 1 | 2 | 3 | 4
  descriptionMarkdown: string
}

export interface LinearExportPayload {
  project: string
  epics: string[]
  issues: LinearIssue[]
}

export interface ModernizationDashboardPayload {
  filename: string
  format: ParsedIngestPayload['format']
  recordCount: number
  fields: string[]
  policyStatus: PolicyStatus
  reason?: string
  /** Present only when `policyStatus === 'allowed'` — a denied ingest withholds the scoping dashboard, matching UOW-1.0's forbidden-operation denial behavior. */
  projectId?: string
  projectName?: string
  metrics?: ModernizationMetrics
  risks?: ModernizationRisk[]
  linearExport?: LinearExportPayload
}

const RISKS: ModernizationRisk[] = [
  {
    severity: 'CRITICAL',
    title: 'AS400 batch export lacks real-time webhooks',
    recommendation: 'Bridge AS400 nightly batch exports through a CDC/webhook adapter before cutting over live order flow.',
  },
  {
    severity: 'HIGH',
    title: 'Oracle DB v11g is past end-of-life',
    recommendation: 'Migrate billing warehouse workloads off Oracle v11g before go-live — no vendor security patches remain available.',
  },
  {
    severity: 'MEDIUM',
    title: 'SOC2 Type II requires reconciling the offline sync constraint',
    recommendation: 'Any offline/batch sync path must be reconciled against the real-time system of record prior to use in financial reporting.',
  },
]

const LINEAR_EXPORT: LinearExportPayload = {
  project: 'Project Horizon Modernization',
  epics: ['Phase 1: Security & Identity', 'Phase 2: Core Data Pipeline', 'Phase 3: Billing & Webhook Integration'],
  issues: [
    {
      title: 'Implement SAML 2.0 SSO via Okta for the billing portal',
      labels: ['security', 'architecture'],
      priority: 1,
      descriptionMarkdown: '**Acceptance Criteria**\n- [ ] SAML 2.0 assertions validated against the Okta IdP\n- [ ] Legacy local username/password auth path removed\n- [ ] Every login recorded to the 7-year audit log',
    },
    {
      title: 'Eliminate local PII storage in the billing portal database',
      labels: ['security', 'risk-high'],
      priority: 1,
      descriptionMarkdown: '**Acceptance Criteria**\n- [ ] Customer PII fields migrated to the vendor-hosted CRM/identity layer\n- [ ] Local schema columns holding PII dropped\n- [ ] Data-flow diagram updated and reviewed by the CISO',
    },
    {
      title: 'Replace AS400 nightly batch export with a real-time webhook bridge',
      labels: ['architecture', 'risk-high'],
      priority: 1,
      descriptionMarkdown: '**Acceptance Criteria**\n- [ ] CDC/webhook adapter emits order events within 60s of the AS400 write\n- [ ] Nightly batch export retained as a reconciliation fallback for 1 release cycle\n- [ ] Reconciliation report shows zero drift for 7 consecutive days',
    },
    {
      title: 'Migrate Oracle DB v11g billing workloads off the end-of-life instance',
      labels: ['architecture', 'risk-high'],
      priority: 2,
      descriptionMarkdown: '**Acceptance Criteria**\n- [ ] Billing warehouse workloads running on a supported Oracle/Snowflake target\n- [ ] Cutover runbook reviewed and rehearsed in staging\n- [ ] v11g instance decommissioned',
    },
    {
      title: 'Wire Snowflake as the system-of-record for the reporting pipeline',
      labels: ['architecture'],
      priority: 3,
      descriptionMarkdown: '**Acceptance Criteria**\n- [ ] All reporting dashboards read from Snowflake, not the legacy warehouse\n- [ ] Historical data backfilled and spot-checked against source\n- [ ] Legacy reporting jobs disabled',
    },
    {
      title: 'Extend audit log retention to 7 years for SOC2 compliance',
      labels: ['security'],
      priority: 2,
      descriptionMarkdown: '**Acceptance Criteria**\n- [ ] Retention policy set to 7 years on the audit ledger store\n- [ ] Tamper-evidence (hash chain) verified across the full retention window\n- [ ] SOC2 auditor sign-off recorded',
    },
  ],
}

/** The Project Horizon engagement's own known scoping findings — constant across whichever single discovery artifact is being ingested (see module doc comment above). */
function projectHorizonDashboard(systemsMapped: number): Omit<ModernizationDashboardPayload, 'filename' | 'format' | 'recordCount' | 'fields' | 'policyStatus' | 'reason'> {
  return {
    projectId: 'PROJECT-HORIZON',
    projectName: 'Core ERP & Billing Modernization',
    metrics: {
      totalRequirements: 42,
      systemsMapped,
      fitScorePercentage: 84,
      estimatedCostRangeUsd: { min: 420_000, max: 480_000 },
      estimatedDurationWeeks: { min: 16, max: 20 },
    },
    risks: RISKS,
    linearExport: LINEAR_EXPORT,
  }
}

const PROJECT_HORIZON_FIXTURES = new Set(['enterprise-rfp.pdf.txt', 'system-matrix.csv', 'ciso-constraints.txt'])

const CONTENT_RISK_SIGNALS: ReadonlyArray<{ pattern: RegExp; risk: ModernizationRisk }> = [
  {
    pattern: /\bpii\b/i,
    risk: {
      severity: 'HIGH',
      title: 'Uploaded content references PII handling',
      recommendation: 'Confirm customer PII is scoped out of any new service before it touches this dataset.',
    },
  },
  {
    pattern: /as400|mainframe|legacy/i,
    risk: {
      severity: 'CRITICAL',
      title: 'Legacy/mainframe dependency referenced in uploaded content',
      recommendation: 'Map the legacy system\'s integration surface before committing to a cutover timeline.',
    },
  },
  {
    pattern: /oracle|end-of-life|eol\b/i,
    risk: {
      severity: 'HIGH',
      title: 'End-of-life dependency referenced in uploaded content',
      recommendation: 'Plan a migration off the unsupported dependency ahead of go-live.',
    },
  },
  {
    pattern: /soc ?2|compliance|audit/i,
    risk: {
      severity: 'MEDIUM',
      title: 'Compliance/audit requirement referenced in uploaded content',
      recommendation: 'Route the requirement through the compliance review checklist before scoping starts.',
    },
  },
]

const DEFAULT_UPLOAD_RISK: ModernizationRisk = {
  severity: 'MEDIUM',
  title: 'No explicit risk signals detected in the uploaded content',
  recommendation: 'Recommend a manual review pass by a solutions architect before scoping.',
}

/** UOW-4.0: client-uploaded discovery artifacts don't carry the Project Horizon engagement's known findings, so the dashboard is derived from the file's own content instead of the canned scenario data. */
function clientUploadDashboard(parsed: ParsedIngestPayload): Omit<ModernizationDashboardPayload, 'filename' | 'format' | 'recordCount' | 'fields' | 'policyStatus' | 'reason'> {
  const haystack = `${parsed.excerpt} ${parsed.fields.join(' ')}`
  const risks = CONTENT_RISK_SIGNALS.filter(({ pattern }) => pattern.test(haystack)).map(({ risk }) => risk)
  if (risks.length === 0) risks.push(DEFAULT_UPLOAD_RISK)

  const systemsMapped = parsed.format === 'csv' ? Math.max(parsed.recordCount, 1) : Math.max(parsed.fields.length, 1)
  const priorityBySeverity: Record<RiskSeverity, LinearIssue['priority']> = { CRITICAL: 1, HIGH: 2, MEDIUM: 3 }

  return {
    projectId: `UPLOAD-${parsed.filename.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toUpperCase()}`,
    projectName: `Custom Ingest — ${parsed.filename}`,
    metrics: {
      totalRequirements: Math.max(systemsMapped * 3, 6),
      systemsMapped,
      fitScorePercentage: 70,
      estimatedCostRangeUsd: { min: systemsMapped * 15_000, max: systemsMapped * 25_000 },
      estimatedDurationWeeks: { min: Math.max(4, systemsMapped), max: Math.max(8, systemsMapped * 2) },
    },
    risks,
    linearExport: {
      project: `Custom Ingest — ${parsed.filename}`,
      epics: ['Phase 1: Discovery & Risk Remediation'],
      issues: risks.map((risk) => ({
        title: risk.title,
        labels: ['upload', `risk-${risk.severity.toLowerCase()}`],
        priority: priorityBySeverity[risk.severity],
        descriptionMarkdown: `**Acceptance Criteria**\n- [ ] ${risk.recommendation}`,
      })),
    },
  }
}

export function evaluateGovernance(parsed: ParsedIngestPayload): ModernizationDashboardPayload {
  const base = { filename: parsed.filename, format: parsed.format, recordCount: parsed.recordCount, fields: parsed.fields }

  const rateLimit = checkRateLimit()
  if (!rateLimit.allowed) {
    return { ...base, policyStatus: 'denied', reason: rateLimit.reason }
  }

  const forbidden = checkForbiddenOperation(parsed.excerpt)
  if (!forbidden.allowed) {
    return { ...base, policyStatus: 'denied', reason: forbidden.reason }
  }

  if (!PROJECT_HORIZON_FIXTURES.has(parsed.filename)) {
    return { ...base, policyStatus: 'allowed', ...clientUploadDashboard(parsed) }
  }

  // fixtures/stackryn/system-matrix.csv is the 12-system inventory this
  // scenario's metrics were scoped against — when that's literally what's
  // being ingested, reflect its real record count rather than the constant.
  const systemsMapped = parsed.format === 'csv' ? parsed.recordCount : 12

  return { ...base, policyStatus: 'allowed', ...projectHorizonDashboard(systemsMapped) }
}
