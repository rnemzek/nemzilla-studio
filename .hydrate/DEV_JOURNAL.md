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
