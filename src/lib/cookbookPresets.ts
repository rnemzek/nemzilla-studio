export interface CookbookPreset {
  id: string
  label: string
  description: string
  /** Sent as /api/agent/stream's ?prompt= — matched by appGeneratorPrompt.ts's matchScenario(). */
  prompt: string
}

export const COOKBOOK_PRESETS: CookbookPreset[] = [
  {
    id: 'acme-order',
    label: 'ACME Order System',
    description: 'Synthetic catalog + governance/policy rules engine.',
    prompt: 'ACME Order',
  },
  {
    id: 'today-itinerary',
    label: '"My TODAY" Itinerary',
    description: 'Live web fetching (MLB, TheMealDB, Open-Meteo) + errand rules.',
    prompt: 'Today Itinerary',
  },
  {
    id: 'b2b-lead-scoring',
    label: 'B2B Lead Scoring Bot',
    description: 'Threshold rules + a simulated outbound webhook alert.',
    prompt: 'B2B Lead Scoring',
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
    label: 'PDF Scoping Brief',
    filename: 'sample.pdf.txt',
    payload:
      'ACME CORP — VENDOR SCOPING BRIEF\nExtracted via PDF text layer.\nAuto-approve ceiling requested: $600\nOrder threshold ceiling: $500\nNotes: escalate anything above ceiling to HITL review.\n',
  },
  {
    id: 'stackryn-csv',
    format: 'csv',
    label: 'CSV Catalog Export',
    filename: 'sample.csv',
    payload: 'item,unit_price,qty\nWidget,12.50,40\nGadget,29.99,15\nSprocket,4.75,120\n',
  },
  {
    id: 'stackryn-txt',
    format: 'txt',
    label: 'Plain-Text Scoping Notes',
    filename: 'sample.txt',
    payload: 'ACME Corp — Q3 scoping notes\nVendor: ACME Corp\nRequested auto-approve threshold: $150\nCatalog: Widgets, Gadgets, Sprockets\n',
  },
]
