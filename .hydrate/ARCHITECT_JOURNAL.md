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

## UOW-4.0 — Stackryn Unified Ingest UX & Dynamic File Upload Integration (2026-09-10)

New contract: `POST /api/stackryn/ingest` now accepts two request shapes —
the existing `application/json` `{ format, filename, payload }` preset body
(unchanged), or `multipart/form-data` with a single `file` field, dispatched
on the request's `content-type` header. For the multipart path, `format` is
inferred from the uploaded filename's extension (`.pdf`/`.csv`/`.txt`/
`.json`) rather than caller-declared — a 400 rejects any other extension
before governance ever runs. `IngestFormat` gained a 4th member, `'json'`
(array-of-records or single-object payloads).

Established design decision: `evaluateGovernance()` now branches on whether
the ingested `filename` matches one of the 3 known Project Horizon fixtures.
That preserves UOW-3.0's contract exactly (same canned dashboard, byte-for-
byte, for the 3 known artifacts the existing test suite and Preset Cookbook
bundle exercise) while giving genuinely novel client uploads their own
honestly-dynamic evaluation path (`clientUploadDashboard()`) — a keyword-
based risk scan over the parsed content/fields, generic project id/name
derived from the filename, and metrics/Linear export scaled off the actual
record/field count instead of echoing the Project Horizon engagement's own
numbers for unrelated content. This is a narrower, purpose-built alternative
to the "one aggregate engagement view" model UOW-3.0 established — it only
kicks in for content that isn't part of that named engagement, so the two
data sources never contradict each other for the same filename.

Established abstraction: `CookbookDropdown.tsx`'s 3 independent preset
triggers collapsed into one `launchStackrynBundle()` sequential-ingest loop
over `STACKRYN_INGEST_PRESETS` — the preset registry itself didn't need to
change shape, only how the UI iterates and reports over it. Anything added
to `STACKRYN_INGEST_PRESETS` in the future is automatically included in the
bundle with no further UI change.

Trade-off: the UOW's spec didn't list `FileUploadZone.tsx`,
`stackrynFormatParsers.ts`, or `stackrynIngestClient.ts` in its File Scope,
but AC #3/#4 are impossible to satisfy without a new upload component and
without the format-parser/client-wrapper changes those criteria require —
implemented anyway per the acceptance criteria's own explicit text; see Dev
Journal for the full file list.

## UOW-5.0 — Executive Mobile-First Risk & Effort Charting (2026-09-10)

Established design decision: "System Integration Readiness" (API-Ready /
Adapter Needed / EOL Legacy) has no backing field anywhere in
`ModernizationDashboardPayload`/`ModernizationMetrics`, and this UOW's File
Scope was `src/components/*` only — no server/store changes authorized. The
distribution shown is therefore a **client-side presentational derivation**,
not a new domain concept: each risk already on the payload is classified by
a keyword match against its own `title`/`recommendation` text, and whatever
`systemsMapped` count isn't accounted for by a matched risk is treated as
API-Ready. This is an honest approximation, not a precise per-system
readiness audit — if the Lead Architect wants a real per-system breakdown
later, that requires a new payload field (e.g. a `systems: Array<{ name,
readiness }>` on `ModernizationDashboardPayload`) populated server-side by
`stackrynGovernanceEngine.ts`, at which point `StackrynReadinessCharts.tsx`
should switch from keyword inference to reading that field directly.

Established abstraction: `StackrynReadinessCharts.tsx` is a standalone
presentational component pair (`SystemReadinessDistribution`,
`RiskSeverityBreakdown`) taking only `{ systemsMapped, risks }` — no store
coupling — so `StackrynCockpitPanel.tsx` stays the only place that reads
`stackrynDashboardStore`, and the charts stay trivially reusable/testable
against any `ModernizationRisk[]`.

Architectural wisdom: a keyword-based classifier over free-text risk
copy is fragile to word choice drift — the SOC2 risk's own recommendation
text ("real-time system of record") false-matched an initial `real-time`
adapter-keyword before it was narrowed to `webhook|adapter|\bcdc\b`. Any
future addition to `stackrynGovernanceEngine.ts`'s risk copy (the
`RISKS`/`CONTENT_RISK_SIGNALS` constants) should be checked against
`StackrynReadinessCharts.tsx`'s `ADAPTER_PATTERN`/`EOL_PATTERN` regexes for
accidental cross-matches, or — better — promoted to the real payload field
described above so the two can't drift.

## UOW-6.0 — Purge Order Entry Domain & Narrow to TODO-Only Micro-App Engine (2026-09-11)

Architectural pivot: this platform's app-generation surface (distinct from
the separate Stackryn ingestion/cockpit flow, which is untouched) now has
exactly one domain — TODO list. `TEMPLATE_REGISTRY` (`templateRegistry.ts`)
and `COOKBOOK_PRESETS` (`cookbookPresets.ts`) both went from 3 entries to 1.
`appGeneratorPrompt.ts`'s `ScenarioId` union shrank from 4 members to 2
(`'today-itinerary' | 'default-sandbox'`).

Swarm topology contract (`agentStream.ts`'s `runSwarmPipeline()`) is now a
fixed backbone: `PO -> Architect -> AI Vendor -> AI TODO -> [optional AI
Sport/AI SS/AI Food] -> Policy -> Lead Dev`. `AI Vendor` and `AI TODO` are
both `alwaysOn: true` in `domainAgents.ts`'s `REGISTRY` (the old `AI OE`
entry is deleted outright, not merged into anything); `AI Sport`/`AI SS`/`AI
Food` remain conditional via the existing Haiku classification call.
Lead Dev synthesis is no longer a two-way branch (`synthesizeOrderEntryApp`
vs `synthesizeItineraryApp`) — `swarmCodeSynthesizer.ts` exports only
`synthesizeItineraryApp` now, called unconditionally.

Established (kept, not new): `synthesizeItineraryApp()` /
`buildUnifiedItinerarySnippet()` (the errand + recipe + entertainment
checklist generator, previously the "itinerary/day-planner" domain's output)
is now this platform's *only* generated-app shape, doing double duty as "the
TODO app." No new synthesizer was built — a deliberate PO call to reuse
working code rather than build a narrower plain-checklist generator from
scratch.

Data-model note: `PoKnownFields`/`RESPONSE_SCHEMA`
(`poInterviewLLM.ts`) were **not** changed — `vendorName`/`catalog`/
`hitlThreshold` remain the one domain-neutral extraction contract, same as
before this UOW. Only the system prompt's framing text changed (no more
"pick OE or Itinerary" greeting; the AI PO now assumes TODO list
unconditionally).

Explicitly preserved despite surface-level name overlap with the purge: the
Stackryn ingest fixtures `enterprise-rfp.pdf.txt`/`ciso-constraints.txt`/
`system-matrix.csv` (`STACKRYN_INGEST_PRESETS` in `cookbookPresets.ts`) and
the entire Stackryn Modernization Cockpit pipeline
(`stackrynGovernanceEngine.ts`, `stackrynFormatParsers.ts`,
`routes/stackrynIngest.ts`, the Cockpit panel/charts) — a separate product
surface from app-generation, confirmed intact by `npm run test:stackryn`
passing unchanged.

Deliberately left alone (`orders.ts`'s `order_decision` audit endpoint,
`sandboxStore.ts`'s OE-postMessage relay, `sandboxTemplate.ts`'s
`SANDBOX_MESSAGE.order` constant): now dead code paths — no generated app
emits `nemzilla:sandbox-order-decision` anymore — but ripping them out would
have required touching `sandboxStore.ts`/route registration, which sit
outside this UOW's file boundary. If a future UOW wants this endpoint gone
entirely, it needs its own explicit File Touch Boundary grant for
`sandboxStore.ts`.

## UOW-6.1 — Zip Code Location Provider & Geolocation Strategy (2026-09-12)

New contract: `SANDBOX_MESSAGE.locationState` / `restoreLocationState`
(`sandboxTemplate.ts`) — a generated TODO app relays its active
`{zip, lat?, lng?, label}` location up to the parent the same way
`itineraryState` already relays checkbox completion; the parent persists it
to real-origin `localStorage` (`nemzilla-studio:location-state`) and mirrors
`label` into `SandboxState.locationLabel` for the Preview Frame header
badge. `restoreLocationState` is sent back down once per `rendered`, so a
refreshed/re-generated preview restores the visitor's last zip/coords
instead of re-prompting.

Established abstraction: `src/server/services/locationProviderSnippet.ts` —
a single shared client-code-gen module (badge markup, modal markup,
behavior script) consumed by both TODO app generators
(`swarmCodeSynthesizer.ts`'s conversational/swarm path and
`appGeneratorPrompt.ts`'s template-preview path), so the two independent
generation paths render byte-identical location UI/behavior instead of
drifting. Both generators still mirror the two new `SANDBOX_MESSAGE` type
strings as local string constants rather than importing `sandboxTemplate.ts`
— confirmed via `tsconfig.node.json` that `src/lib` isn't part of the node
project (aside from a short explicit whitelist), so `src/server` genuinely
cannot import it; this was already this codebase's convention for
`itineraryState`/`restoreItineraryState`, now extended consistently.

Trade-off: `locationLabel` on `SandboxState` is treated as visitor/device-
scoped state (seeded from `localStorage` at store creation, never reset by
`setCode`/`connectToStream`), deliberately unlike `domainLabel` which is
per-generated-app and resets on every new build. A generated app's location
is conceptually "where the visitor is," not a property of which app happens
to be on screen, so it should survive switching between generated apps in
the same session.

Gotcha (caught by browser verification, not `tsc`/`npm test`): a sandboxed
`<iframe sandbox="allow-scripts">` blocks `navigator.geolocation` entirely
via the Permissions Policy the `sandbox` attribute implies — a policy
violation logged to the console, not a JS exception the app's own
try/catch or geolocation error-callback ever sees. Fixed by adding
`allow="geolocation"` to the iframe in `AppPreview.tsx`; the app's
denial/fallback behavior was already correct either way, but without this
attribute a real permission grant could never reach the visitor at all.

## UOW-6.2 — Real-Time Multi-Device Sync (Room-Based SSE Pub/Sub) (2026-09-12)

New contract: `GET /api/sync/:roomId` (SSE — emits a `state` event
`{tasks}` immediately with the room's last-known state if any, then again
on every subsequent broadcast) and `POST /api/sync/:roomId` (`{tasks}` →
fan out to every subscriber of that room). Both backed by a new in-memory,
per-room pub/sub (`syncRoomManager.ts`) — the first keyed/multi-room
broadcast primitive in this codebase; `sessionManager.ts`'s existing
subscribe/broadcastFrame pair is global (one build at a time), so it
couldn't be reused directly, but the new module mirrors its exact
subscribe/notify shape.

Design decision: `roomId` = the published app's own `/share/:slug` slug,
not a separately generated id. A generated app's sync script resolves its
room purely client-side at request time (`?room=` query param, falling
back to parsing the `/share/<slug>` path) rather than the server
templating a room id into the stored `htmlPayload` at publish time — this
keeps `publishedAppStore.ts` completely untouched (its stored HTML stays
generic/slug-independent) and means the exact same generated document
works correctly under whatever slug it's later served at.

Established abstraction: `taskSyncSnippet.ts` — deliberately shape-agnostic
about the generator's `TASKS` structure (the swarm and template-preview
generators use different shapes), so it only ever relays whole-array JSON
snapshots rather than typed per-action events (`add`/`toggle`/`delete`).
This is a real simplification versus the UOW's literal per-action-type
framing: since neither generator has an "add task"/"delete task" UI yet
(confirmed absent in UOW-6.1), a full-state broadcast already covers every
action that exists today (checkbox toggle) and requires no changes at all
if add/delete UI is added later — the new UI would just mutate `TASKS` and
call the same `broadcastTaskState()`.

Gotcha (caught only by browser verification — clean `tsc`/`npm test` the
whole time): `server.ts`'s dev-mode request router forwarded only `/api`
and `/sandbox-frame` paths to Hono; `/share/:slug` (added back in an
earlier UOW) fell through to Vite's SPA middleware and silently served the
Studio shell instead of the published app. This means the entire
publish/share feature has likely never actually worked under `npm run dev`
— only in a production build (`server.ts`'s `serveStatic` fallback branch)
— since nothing before this UOW needed to *load* a published app locally
(publishing and viewing the resulting link were never both exercised in
the same dev session). Fixed by adding `/share` to the same passthrough
condition as `/sandbox-frame`. Worth flagging to the Product Owner: any
other future feature that depends on opening a `/share/:slug` link during
local development would have hit this same silent failure.
