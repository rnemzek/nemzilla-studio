# UOW-3.0: Stackryn Modernization Cockpit & Linear Backlog Exporter

## Objective
Pivot the ingestion fixtures, governance engine, and UI preview to serve as an Enterprise Modernization Scoping Dashboard ("Project Horizon ERP & Billing Migration"). Replace simple line items with multi-format discovery artifacts (RFP PDF, System Inventory CSV, CISO Security TXT), evaluate system risks and budget/timeline metrics, render a full Project Dashboard in `<AppPreview/>`, and generate a structured Linear Issue Export payload (Projects, Epics, and Issues).

## Acceptance Criteria
- [x] Replace `fixtures/stackryn/` ACME order files with Enterprise Modernization artifacts (`enterprise-rfp.pdf.txt`, `system-matrix.csv`, `ciso-constraints.txt`).
- [x] Update `src/server/services/stackrynGovernanceEngine.ts` to emit a `ModernizationDashboardPayload` with scope metrics ($420k–$480k, 16–20 weeks, 84% fit).
- [x] Implement risk evaluator logic flagging CRITICAL (AS400 webhook gap), HIGH (Oracle v11g EOL), and MEDIUM (SOC2 offline sync constraint) alerts.
- [x] Generate a structured Linear Issue Export payload containing Projects, Epics/Milestones, and prioritized Markdown issues.
- [x] Update `<AppPreview/>` / dashboard UI component to render the Stackryn Modernization Cockpit (metrics, risk matrix, Linear export card). (`StackrynCockpitPanel.tsx` — a standalone panel, not embedded in `<AppPreview/>` itself; see Architect Journal for why.)
- [x] Verify test suite passes (`npm test`) with assertions for the `ModernizationDashboardPayload` and Linear export structure. (10/10 — 2 new tests + a strengthened audit-hash assertion.)

## File Scope (as implemented — see Architect Journal for the `<AppPreview/>` deviation)
- `fixtures/stackryn/*` (3 files replaced)
- `src/server/services/stackrynGovernanceEngine.ts`
- `src/server/routes/stackrynIngest.ts`
- `.codex/demos/acme-stackryn.json`
- `src/lib/cookbookPresets.ts`, `src/lib/stackrynIngestClient.ts`, `src/lib/stackrynDashboardStore.ts` (new)
- `src/components/StackrynCockpitPanel.tsx` (new), `src/components/CookbookDropdown.tsx`, `src/App.tsx`
- `scripts/verify-stackryn-ingest.ts`

## Verification Command
npm test
