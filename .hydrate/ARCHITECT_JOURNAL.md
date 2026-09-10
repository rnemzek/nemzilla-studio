# nemzilla-studio Architect Journal

AI developer journal entry containing an architect's summary of each UOW completed, used to rehydrate the Lead Architect's context.

<!-- Append-only architecture history -->

## UOW-1.0 — Hono Multi-Format Ingest API & Swarm SSE Integration (2026-09-10)

New contract: `POST /api/stackryn/ingest` — `{ format: 'pdf'|'csv'|'txt', filename: string, payload: string }`
-> `{ success: boolean, result: IngestedScopePayload }` (`IngestedScopePayload`:
`{ filename, format, recordCount, fields, policyStatus: 'allowed'|'denied'|'clamped', reason? }`),
422 on a `policyStatus: 'denied'` result, 400 on a malformed request.

Established abstraction: this is the first consumer of the UOW-11 event bus
(`eventBus.ts`) from outside the swarm pipeline — confirms the
`broadcast`+`audit` tagged-event pattern generalizes to any feature that
wants both SSE visibility and audit-ledger persistence, with zero daemon
changes. No new abstractions were introduced; `evaluateGovernance()`
deliberately delegates to the existing `policyEngine.ts` System Ceiling
rather than defining a second policy surface.

Trade-off: the UOW spec's file paths (`src/routes/api/stackryn/ingest.ts`,
`src/lib/stackryn/*.ts`) don't match this repo's actual layout (routes live
in `src/server/routes/`, and `src/lib/` is client-bundle SolidJS stores, not
server logic) — implemented under `src/server/routes/` and
`src/server/services/` instead to stay consistent with the existing
Hono server boundary and avoid leaking Node-only code into the client bundle.

## UOW-2.0 — Stackryn UI Preset Recipe & Command Center Trigger Integration (2026-09-10)

Established abstraction: `RUN_START_AGENTS` (swarmStore.ts) and the
EXECUTING/DONE agent_step reducer are no longer hardcoded to a 2-state
vocabulary — any state name that isn't `'DONE'` now reads as "active", and a
pipeline registers its own "first beat" state (`'EXECUTING'` or `'PLANNING'`
so far) rather than the reducer assuming `'EXECUTING'` universally. This
generalizes the same "known agents get friendly copy, everything else falls
back" pattern the file already uses for agent *names* (see its own doc
comment) to agent *states* too — a third pipeline with its own state
vocabulary can plug in without another reducer rewrite, just an addition to
the start-state check.

Trade-off: `<CommandCenterDrawer/>` (the UOW's named target) is the
ecosystem-module nav switcher (StreamZilla/GridZilla/Robert links), not a
preset launcher — `CookbookDropdown.tsx` + `cookbookPresets.ts` are this
repo's actual equivalent (the UOW's own bracketed alternative). Implemented
there instead; see Dev Journal for the full file list and the two
out-of-literal-File-Scope edits (swarmStore.ts, sessionSerializer.ts) that
were necessary for the acceptance criteria to actually work / not regress
the existing saved-runs list.

## UOW-3.0 — Stackryn Modernization Cockpit & Linear Backlog Exporter (2026-09-10)

New contract: `POST /api/stackryn/ingest` now returns a
`ModernizationDashboardPayload` (breaking change from UOW-1.0/2.0's flat
`IngestedScopePayload`, but nothing outside this feature consumed that
shape) — `{ filename, format, recordCount, fields, policyStatus, reason?,
projectId?, projectName?, metrics?, risks?, linearExport? }`, the optional
fields present only when `policyStatus === 'allowed'`. Response also now
carries a top-level `auditHash` (the real SHA-256 hex of this call's own
Cryptographic Audit Ledger block).

Established design decision: the dashboard's project-level metrics/risks/
Linear export are constant regardless of which single artifact (RFP/CSV/
TXT) was ingested — a single POST call ingests one file, but "the
Modernization Cockpit" is inherently a whole-engagement view, and the
Architect's own acceptance criteria gave fixed figures (42/84%/$420k-$480k/
16-20wk) rather than per-file-derived ones. Only `systemsMapped` is
cross-checked against the real CSV record count as a light "don't drift
from the fixture" safeguard. If a future UOW wants genuinely per-document
differentiated output, that's a new design (likely needs a session/
aggregate concept across multiple ingest calls), not a tweak to this one.

Trade-off: the UOW's named target `<AppPreview/>` is a sandboxed,
postMessage-driven iframe rendering *generated app* HTML
(document.write()'d strings from swarmCodeSynthesizer.ts) — a fundamentally
different rendering pipeline from a normal reactive dashboard with a native
clipboard button. Implemented the Cockpit as `StackrynCockpitPanel.tsx`, a
standalone `FloatingShell` panel (same pattern as SwarmCanvas/
AuditLedgerPanel) instead, satisfying the File Scope's own bracketed
alternative ("Preview / Dashboard views").
