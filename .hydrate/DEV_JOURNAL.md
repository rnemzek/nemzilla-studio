# nemzilla-studio Developer Journal

AI developer journal containing a summary of each UOW completed.

<!-- Append-only implementation history -->

## UOW-1.0 — Hono Multi-Format Ingest API & Swarm SSE Integration (2026-09-10)

Recovered a corrupted `.hydrate/CURRENT_UOW.md`/`ROADMAP.md` (both had been
overwritten with the deleted root `ARCHITECTURE.md` content) before this UOW
could land — restored `ARCHITECTURE.md` at root and mirrored it to
`docs/ARCHITECTURE.md`.

Implementation, following existing conventions rather than the UOW's literal
(non-existent) file paths:
- `src/server/services/stackrynFormatParsers.ts` — normalizes pdf/csv/txt
  payloads into a shared `ParsedIngestPayload` shape (`format` is
  caller-declared, not sniffed from the filename).
- `src/server/services/stackrynGovernanceEngine.ts` — `evaluateGovernance()`
  reuses the existing System Ceiling (`policyEngine.ts`'s `checkRateLimit`,
  `checkForbiddenOperation`) rather than inventing a parallel rule set.
- `src/server/routes/stackrynIngest.ts` — new `POST /api/stackryn/ingest`
  Hono handler, wired into `src/server/app.ts`. Emits `PLANNING -> PARSING ->
  EVALUATING -> DONE` as tagged `PipelineEvent`s with both `broadcast` and
  `audit` tags, so the existing `broadcastRelay.ts` (SSE fan-out to
  `/api/agent/stream`) and `auditDaemon.ts` (Cryptographic Audit Ledger)
  daemons pick it up with zero new wiring.
- `fixtures/stackryn/{sample.txt,sample.csv,sample.pdf.txt}` — sample
  multi-format scoping payloads.
- `scripts/verify-stackryn-ingest.ts` + `"test:stackryn"` npm script, folded
  into `"test"` alongside the existing `test:sse` — covers all three fixture
  formats being allowed, a forbidden-operation payload being denied (422),
  malformed-request rejection (400), the SSE broadcast, and the audit ledger
  write.

Edge cases handled: missing/invalid `format`, missing `filename`/`payload`,
malformed JSON body, and a request naming a `SYSTEM_CEILING.forbiddenOperations`
entry (denied with a reason, still audited).

Test suite: 8/8 passing (`npm test` = `test:sse` 4 checks + `test:stackryn` 5 checks).

## UOW-2.0 — Stackryn UI Preset Recipe & Command Center Trigger Integration (2026-09-10)

Implementation, following existing conventions rather than the UOW's literal
(`CommandCenterDrawer.tsx`/`presetStore.ts`) references — that component is
the ecosystem-module nav switcher, not a preset launcher; `CookbookDropdown.tsx`
+ `cookbookPresets.ts` are this repo's actual "preset registry + trigger UI"
(already used by `COOKBOOK_PRESETS`/`?prompt=` flow):
- `.codex/demos/acme-stackryn.json` — static preset-definition artifact
  mapping the three `fixtures/stackryn/` formats (this directory is
  `.gitignore`d in full, so this file exists on disk per the acceptance
  criterion but isn't committed — consistent with every other file already
  in that directory).
- `src/lib/cookbookPresets.ts` — added `StackrynIngestPreset` type +
  `STACKRYN_INGEST_PRESETS` (3 entries, payload text mirrors
  `fixtures/stackryn/*` verbatim). Kept separate from `CookbookPreset`
  because it drives a fundamentally different flow (`POST` with a body, not
  `?prompt=` code generation).
- `src/lib/stackrynIngestClient.ts` (new — not in the UOW's literal File
  Scope, but a one-function file matching the established
  `pingClient.ts`/`feedbackClient.ts` thin-POST-wrapper convention) —
  `triggerStackrynIngest()`.
- `src/components/CookbookDropdown.tsx` — new "Stackryn Scope Ingestion"
  section: three buttons, an inline ✓/✗ status line, using
  `triggerStackrynIngest()`.
- `src/lib/swarmStore.ts` (2 small edits, outside literal File Scope but
  required for AC #4 to actually work): added `'Stackryn Ingest'` to
  `RUN_START_AGENTS`, and widened the "a fresh run just began" / "still
  active" checks from a hardcoded `'EXECUTING'` to also recognize
  `'PLANNING'` as a pipeline's first beat and any non-`'DONE'` state as
  "active" — the Stackryn ingest route emits `PLANNING`/`PARSING`/
  `EVALUATING`/`DONE`, not `EXECUTING`/`DONE`, so without this the node
  would sit inert behind the idle template preview and never actually
  render. Verified zero behavior change for the classic/swarm pipelines
  (they only ever emit `EXECUTING`/`DONE`) via the still-passing
  `test:sse` suite.
- `src/server/services/sessionSerializer.ts` (1 small edit, outside literal
  File Scope): `listSavedSessions()` now skips any `.codex/demos/*.json`
  entry missing a string `sessionId`/`scenario`/`prompt`/`timestamp` instead
  of pushing `undefined` fields — without this, `acme-stackryn.json` (which
  isn't shaped like a `SessionRecord`) would crash the summary list's
  `.localeCompare` sort and break the existing "AgentZ Cookbook (saved
  runs)" dropdown section for everyone.

Verification: `npm test` 8/8 (unchanged from UOW-1.0 — this UOW touched no
backend contract). Manually browser-tested via a one-off Playwright script
(headless Chromium, real dev server): opened "Preset Cookbook", confirmed
the new section and its 3 buttons, clicked "CSV Catalog Export", confirmed
the inline status line read "✓ CSV Catalog Export: 3 record(s) allowed",
and confirmed the Swarm Canvas rendered a "Stackryn Ingest" node reaching
"done" — with zero console errors and the pre-existing saved-runs list
still intact (28 real `acme-order` entries, no corrupted row).

## UOW-3.0 — Stackryn Modernization Cockpit & Linear Backlog Exporter (2026-09-10)

Pivoted the whole Stackryn feature from the "ACME order scoping" demo to the
"Project Horizon" enterprise-modernization scenario:
- `fixtures/stackryn/` — deleted `sample.{txt,csv,pdf.txt}`, added
  `enterprise-rfp.pdf.txt` (executive RFP), `system-matrix.csv` (12 legacy
  systems, matching `systemsMapped: 12`), `ciso-constraints.txt` (SOC2/SAML/
  Okta/7-year audit-log rules).
- `src/server/services/stackrynGovernanceEngine.ts` — replaced
  `IngestedScopePayload` with `ModernizationDashboardPayload`. System Ceiling
  checks (rate limit / forbidden ops) still run per-request and can still
  deny; on allow, returns the Project Horizon engagement's own canned
  scoping findings (42 requirements, 84% fit, $420k-$480k, 16-20wk — these
  are the scoping engagement's known findings, not derivable from a single
  uploaded document, same precedent as every other canned scenario in this
  codebase) plus the 3 named risks (CRITICAL/HIGH/MEDIUM) and the Linear
  export payload (3 epics, 6 labeled/prioritized markdown issues). One real
  cross-check: `systemsMapped` reflects the actual CSV record count when a
  system-matrix CSV is what's being ingested, rather than always echoing the
  constant.
- `src/server/routes/stackrynIngest.ts` — added a real audit-ledger hash to
  the response (`auditHash`): after emitting the DONE event's audit tag,
  yields one `setImmediate` tick (long enough for `auditDaemon.ts`'s drain
  loop to `chain.push()` the new block — that happens synchronously before
  its own `await persistBlock()`), then scans the last 20 chain entries by
  `sessionId` for this call's own block (not just "the latest" — the
  always-running classic/swarm demo pipelines append their own audit blocks
  concurrently).
- `.codex/demos/acme-stackryn.json`, `src/lib/cookbookPresets.ts`
  (`STACKRYN_INGEST_PRESETS`), `scripts/verify-stackryn-ingest.ts` — updated
  to the 3 new fixtures/filenames throughout.
- `src/lib/stackrynIngestClient.ts` — response type now carries `metrics`/
  `risks`/`linearExport`/top-level `auditHash`.
- `src/lib/stackrynDashboardStore.ts` (new) — tiny shared store holding the
  latest ingest response, so the trigger buttons (`CookbookDropdown.tsx`)
  and the new Cockpit panel stay in sync without prop drilling.
- `src/components/StackrynCockpitPanel.tsx` (new) — the "Stackryn
  Modernization Cockpit": scope/metrics header, color-coded risk matrix,
  and a Linear Backlog Export card with a working "Copy Linear Payload /
  JSON" clipboard button and an audit-signed status tag showing the real
  ledger hash. Mounted in `App.tsx` as a standalone `FloatingShell` panel
  (matching SwarmCanvas/AuditLedgerPanel's pattern) rather than embedded in
  `<AppPreview/>` — see Architect Journal for why.

New assertions added to `scripts/verify-stackryn-ingest.ts` per AC #6:
`testModernizationDashboardPayload` (exact metrics, systemsMapped
cross-check, all 3 risk severities/titles) and `testLinearExportStructure`
(project name, 3 epics covering the named phases, every issue has a title/
label/valid priority/markdown checkboxes, and the `security`/`architecture`/
`risk-high` labels are all represented). Also strengthened
`testAuditedToLedger` to assert the response's `auditHash` is a real 64-char
SHA-256 hex string matching the ledger's own block hash (not just "a block
exists").

Verification: `npm test` 10/10 (4 `test:sse` + 6 `test:stackryn`, up from 5
since UOW-2.0 — 2 new + the audit-hash check strengthened). Manually
browser-tested via a one-off Playwright script with clipboard permissions
granted: confirmed the Cockpit's empty state, triggered "System Inventory
Matrix" from the dropdown, confirmed the dropdown's inline status
("✓ ... 84% fit"), confirmed the Cockpit rendered the full metrics header +
3-severity risk matrix + Linear export card, clicked "Copy Linear Payload /
JSON" and read back the clipboard to confirm it's valid JSON matching the
`LinearExportPayload` shape, and confirmed a real SHA-256 hash on the
audit-signed tag — zero console errors.

## UOW-4.0 — Stackryn Unified Ingest UX & Dynamic File Upload Integration (2026-09-10)

- `src/components/CookbookDropdown.tsx` — replaced the 3 per-preset "Stackryn:
  Project Horizon Cockpit" buttons with one "Ingest Project Horizon Bundle"
  card (PDF RFP / CSV Matrix / TXT Constraints tags). `launchStackrynBundle()`
  runs `STACKRYN_INGEST_PRESETS` through `triggerStackrynIngest()` in turn,
  updating the status line per-file and bailing out on the first denial;
  replaces the old per-preset `launchStackrynIngest()`.
- `src/components/StackrynCockpitPanel.tsx` — a `createEffect` watching
  `stackrynDashboardState.latest` calls `sectionRef.scrollIntoView({behavior:
  'smooth', block: 'nearest'})` whenever a new ingest result lands, and now
  renders `<FileUploadZone/>` above the dashboard content.
- `src/components/FileUploadZone.tsx` (new) — drag-and-drop + click-to-browse
  dropzone for `.pdf`/`.csv`/`.txt`/`.json`; client-side extension check,
  then `triggerStackrynFileUpload()` + `setStackrynResult()`, matching
  `CookbookDropdown.tsx`'s own status-line convention.
- `src/server/services/stackrynFormatParsers.ts` — widened `IngestFormat` to
  include `'json'`, added `parseJson()` (array-of-records or single object),
  and `inferFormatFromFilename()` for the upload path (no caller-declared
  `format` field on a raw file upload, unlike the JSON preset body).
- `src/server/routes/stackrynIngest.ts` — `readIngestRequest()` branches on
  `content-type`: `multipart/form-data` goes through `c.req.parseBody()` and
  `inferFormatFromFilename()` on the uploaded `file` field's name; anything
  else falls back to the existing `c.req.json()` path unchanged. Same
  downstream pipeline (PLANNING -> PARSING -> EVALUATING -> DONE, broadcast +
  audit) for both.
- `src/server/services/stackrynGovernanceEngine.ts` — `evaluateGovernance()`
  now branches on whether the ingested `filename` is one of the 3 known
  Project Horizon fixtures. Known fixtures keep the exact canned dashboard
  (UOW-3.0 behavior, unchanged). Anything else (a client upload) goes through
  new `clientUploadDashboard()`: scans the parsed content/fields against 4
  keyword risk signals (PII, legacy/mainframe, EOL/Oracle, SOC2/compliance —
  falls back to a single generic "recommend manual review" MEDIUM risk if
  none match), and derives `projectId`/`projectName`/metrics/Linear export
  from the upload itself rather than the Project Horizon scenario data.
- `src/lib/stackrynIngestClient.ts` — widened the `format` union to include
  `'json'`; factored the shared fetch/response-parsing into
  `postStackrynIngest()`, added `triggerStackrynFileUpload(file)` (POSTs a
  `FormData` with the file under the `file` field — no `Content-Type` header,
  so the browser sets the multipart boundary).

Verification: `npm test` 18/18 (unchanged from UOW-3.0 — no existing
fixture/request shape changed, so `test:stackryn`'s 10 assertions and
`test:sse`'s 4 all still pass as-is). The new multipart path isn't covered by
the existing `verify-stackryn-ingest.ts` (JSON-body only), so it was
hand-verified against a live `tsx server.ts`: uploaded a custom
`custom-upload.json` (`[{"system":"Custom App","legacy":true}]`) via
`curl -F file=@...` and confirmed a 200 with a dynamically-derived
`UPLOAD-CUSTOM-UPLOAD-JSON` project, a CRITICAL "legacy/mainframe" risk
correctly matched from the content, and a real audit hash; also confirmed an
unsupported extension (`.exe`) is rejected with 400 before reaching
governance. `tsc -b` type-checks clean.

## UOW-5.0 — Executive Mobile-First Risk & Effort Charting (2026-09-10)

- `src/components/StackrynReadinessCharts.tsx` (new) — two presentation-only
  chart components consumed by `StackrynCockpitPanel.tsx`, no new
  server/store fields (none were in this UOW's file scope):
  - `SystemReadinessDistribution({ systemsMapped, risks })` — a horizontal
    CSS stacked-bar (API-Ready / Adapter Needed / EOL Legacy) plus a dot
    legend with counts. Since `ModernizationDashboardPayload` has no
    per-system readiness field, each known risk is classified into a bucket
    by keyword match against its own `title`/`recommendation` text
    (`webhook|adapter|cdc` -> Adapter Needed, `end-of-life|eol|legacy|
    mainframe|as400` -> EOL Legacy); anything unmatched (e.g. a SOC2/
    compliance-only risk) doesn't move a system out of API-Ready. Remaining
    `systemsMapped` count fills the API-Ready bucket.
  - `RiskSeverityBreakdown({ risks })` — an SVG donut (stroke-dasharray
    stacked-segment technique, `viewBox 0 0 36 36`, circumference-100 radius)
    tallying `risks` by `RiskSeverity`, plus the same dot-legend pattern,
    with the total risk count in the donut's center.
- `src/components/StackrynCockpitPanel.tsx` — both charts inserted between
  the Scope & Metrics header and the existing Automated Risk Matrix, inside
  the same `Show`/`response()`/`result()` reactive chain the metrics grid
  already uses, so uploading a file via `FileUploadZone.tsx` (which calls
  `setStackrynResult()`) re-renders the charts exactly like the rest of the
  panel — no additional wiring needed.
- Mobile-first: the distribution bar's legend and the donut's legend both use
  `flex flex-wrap`, and the donut card stacks to a single column below `sm:`
  (`flex-col sm:flex-row`); the donut SVG itself is a fixed `h-20 w-20`
  scaled by `viewBox`, not fixed pixel geometry.

Bug caught and fixed during manual verification (see below): the initial
adapter-keyword pattern included a bare `real-time`, which also matched the
Project Horizon SOC2 risk's recommendation text ("...real-time system of
record...") and misclassified it as "Adapter Needed" (2/1/9 split instead of
the correct 1/1/10). Narrowed the pattern to `webhook|adapter|\bcdc\b`.

Verification: `npm test` 18/18 (unchanged — this UOW touched no
server/route/test-covered code). `tsc -b` type-checks clean. Manually
verified live via a throwaway Playwright driver (spawned `tsx server.ts`,
dismissed the `ExecutiveShowcaseModal`, clicked "Preset Cookbook" ->
"Ingest Project Horizon Bundle", screenshotted the Cockpit panel): confirmed
both `[data-testid="stackryn-readiness-distribution"]` and
`[data-testid="stackryn-risk-severity-donut"]` render with the corrected
10 API-Ready / 1 Adapter Needed / 1 EOL Legacy split and 1 CRITICAL / 1 HIGH
/ 1 MEDIUM donut, at both 1280px and a 375px iPhone-width viewport, with zero
browser console errors. The throwaway driver script and its screenshots were
not committed (outside this UOW's file scope).
