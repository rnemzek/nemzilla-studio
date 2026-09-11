export interface CookbookPreset {
  id: string
  label: string
  description: string
  /** Sent as /api/agent/stream's ?prompt= — matched by appGeneratorPrompt.ts's matchScenario(). */
  prompt: string
}

export const COOKBOOK_PRESETS: CookbookPreset[] = [
  {
    id: 'todo-list',
    label: 'TODO List',
    description: 'Task checklist + live web fetching (MLB, TheMealDB, Open-Meteo) + a review-threshold flag.',
    prompt: 'Today Itinerary',
  },
]

/**
 * UOW-2.0: the Stackryn ingest presets — see `.codex/demos/acme-stackryn.json`
 * for the same mapping as a standalone artifact. Unlike `CookbookPreset`
 * above (which drives the classic `?prompt=` code-generation pipeline via
 * `sandboxStore.connectGenerator`), these trigger `POST /api/stackryn/ingest`
 * directly (see `stackrynIngestClient.ts`) — a fundamentally different flow,
 * so it gets its own type rather than overloading `CookbookPreset.prompt`.
 * `payload` mirrors `fixtures/stackryn/*` verbatim (also used by
 * scripts/verify-stackryn-ingest.ts) so the UI trigger and the test suite
 * exercise the exact same sample content.
 */
export interface StackrynIngestPreset {
  id: string
  format: 'pdf' | 'csv' | 'txt'
  label: string
  filename: string
  payload: string
}

export const STACKRYN_INGEST_PRESETS: StackrynIngestPreset[] = [
  {
    id: 'stackryn-pdf',
    format: 'pdf',
    label: 'Enterprise RFP',
    filename: 'enterprise-rfp.pdf.txt',
    payload:
      'PROJECT HORIZON — CORE ERP & BILLING MODERNIZATION\nRequest for Proposal (Executive Summary — extracted via PDF text layer)\n\nSponsor: VP of Enterprise Technology\nObjective: Replace the legacy AS400-driven order-to-cash pipeline and Oracle\nDB v11g billing warehouse with a modern, API-first platform integrated with\nSalesforce, Stripe, and Snowflake.\n\nScope:\n- Real-time billing and portal modernization for 40,000+ active accounts.\n- Zero local PII storage — all customer PII must reside in the vendor-hosted\n  identity/CRM layer.\n- SOC2 Type II compliance is mandatory for go-live.\n- Target go-live: Q3 next fiscal year.\n\nBudget Guidance: $420,000 - $480,000\nRequested Timeline: 16-20 weeks from kickoff.\n',
  },
  {
    id: 'stackryn-csv',
    format: 'csv',
    label: 'System Inventory Matrix',
    filename: 'system-matrix.csv',
    payload:
      'system,category,api_readiness,complexity_score\nOracle DB v11g,Database,low,9\nSalesforce,CRM,high,4\nAS400,Legacy ERP,none,10\nStripe,Payments,high,3\nSnowflake,Data Warehouse,high,5\nOkta,Identity,high,2\nSAP ECC,ERP,medium,8\nWorkday,HR,high,3\nNetSuite,Finance,medium,6\nTwilio,Messaging,high,2\nSharePoint,Documents,medium,5\nZendesk,Support,high,3\n',
  },
  {
    id: 'stackryn-txt',
    format: 'txt',
    label: 'CISO Constraints',
    filename: 'ciso-constraints.txt',
    payload:
      'CISO COMPLIANCE CONSTRAINTS — PROJECT HORIZON\n\n1. Zero local PII storage — no customer PII may be persisted outside the\n   vendor-hosted CRM/identity layer.\n2. SOC2 Type II certification required for all new services prior to\n   production traffic.\n3. Authentication must use SAML 2.0 via Okta SSO — no local username/\n   password auth paths permitted.\n4. Audit logs must be retained for a minimum of 7 years and be tamper-\n   evident (hash-chained).\n5. Any offline/batch sync path (e.g. AS400 nightly export) must be\n   reconciled against the real-time system of record before use in\n   financial reporting.\n',
  },
]
