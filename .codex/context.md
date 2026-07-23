# Master Unit of Work (UOW) Context Tracker — NemZilla Studio

## Critical Modification Rules
- NEVER rewrite this entire documentation file to update task states.
- Always perform an INPLACE-EDIT to change `[ ]` to `[x]`.

## Active UOW Status
- **Current UOW**: UOW-13 - Pass B: The Step-by-Step Replay Scrubber
- **Active Task**: UOW-13 complete — ready for next UOW

---

## Complete Project Roadmap

### [x] UOW-01 - Repository Initialization & Core Architecture
- [x] Task 1.1 - Initialize Vite + SolidJS TypeScript project scaffolding with Hono server mounting.
- [x] Task 1.2 - Configure Tailwind CSS, custom design tokens (dark theme, radial glows), and base typography.
- [x] Task 1.3 - Create `.env.sample` and configure Hono server entry with initial `/api/health` RPC endpoint.
- [x] Task 1.4 - Create `.codex/journals/uow-01.md` log and update `.codex/architect-journal.md`.
- [x] Task 1.5 - UOW-01 Complete.

### [x] UOW-02 - Hono SSE Engine & Telemetry Pipeline
- [x] Task 2.1 - Build `/src/server/services/agentStream.ts` using Hono `streamSSE` for token & state event streaming.
- [x] Task 2.2 - Implement simulated multi-agent state generator (Planner -> Architect -> Lead Dev -> Reviewer).
- [x] Task 2.3 - Verify SSE stream endpoint with automated fetch test script and zero connection leaks.
- [x] Task 2.4 - Doc update, journal entry, & UOW-02 closure.

### [x] UOW-03 - Interactive Terminal Shell (`nemzilla-cli`)
- [x] Task 3.1 - Build `/src/components/Terminal.tsx` client-side CLI shell in SolidJS with keyboard navigation and history.
- [x] Task 3.2 - Implement CLI command parser (`help`, `run`, `triad`, `metrics`, `clear`, `launch`).
- [x] Task 3.3 - Connect CLI to Hono RPC endpoints for live latency and uptime queries.
- [x] Task 3.4 - Doc update, journal entry, & UOW-03 closure.

### [x] UOW-04 - Multi-Agent Swarm Canvas UI
- [x] Task 4.1 - Build responsive SVG/Canvas Swarm visualizer displaying agent nodes and active data paths.
- [x] Task 4.2 - (re-scoped) Implement force-directed graph positioning (`src/lib/swarmLayout.ts`) with a per-node anchor spring so nodes settle back into the straight pipeline layout; wired into `SwarmCanvas.tsx`.
- [x] Task 4.3 - (re-scoped) Build `src/lib/swarmStore.ts` to parse `/api/agent/stream` SSE events into live per-agent status (idle/thinking/active/completed/error) and per-edge activity; wired into `SwarmCanvas.tsx`. Original 4.3 scope (click-to-view reasoning log) deferred — see uow-04.md Risk/Debt.
- [x] Task 4.4 - Doc update, journal entry, & UOW-04 closure.

### [x] UOW-05 - Ecosystem Portal & Production Hardening
- [x] Task 5.1 - Build top navigation bar and Ecosystem Quick-Launch dock (`robert.nemzilla.net`, `streaming.nemzilla.net`, `grid.nemzilla.net`).
- [x] Task 5.2 - Apply strict security headers middleware (CSP, X-Frame-Options DENY, HSTS).
- [x] Task 5.3 - Validate production build and execute Playwright E2E verification.
- [x] Task 5.4 - Doc update, journal entry, & UOW-05 closure.

### [x] UOW-06 - AgentZ Studio Sandbox Preview Engine
- [x] Task 6.1 - (re-scoped) Build `src/components/AppPreview.tsx` mounting an iframe served from a
      dedicated same-origin `/sandbox-frame` route (`src="/sandbox-frame"`) rather than `srcdoc`,
      to avoid the strict UOW-05 CSP being inherited by the sandboxed document. See uow-06.md.
- [x] Task 6.2 - Build `src/lib/sandboxTemplate.ts` (`buildSandboxDocument`) wrapping generated
      snippets in an HTML5 envelope with Tailwind CDN, Inter font, and a window-level error
      boundary; build `src/server/routes/sandboxFrame.ts` serving the bootstrap shim with its own
      scoped CSP (permissive for Tailwind CDN/inline code, `frame-ancestors 'self'`).
- [x] Task 6.3 - Build `src/lib/sandboxStore.ts` — reactive store holding generated code, preview
      status (`idle/building/ready/error`), and `preview`/`source` tab state; owns the postMessage
      handshake (`ready` -> `code` -> `rendered`/`error`) with the sandbox iframe.
- [x] Task 6.4 - Mount `AppPreview` in `src/App.tsx` alongside `Terminal`; doc update, journal
      entry, & UOW-06 closure.

### [x] UOW-07 - AgentZ Dynamic App Generator & Hybrid Action Engine
- [x] Task 7.1 - Build `src/server/prompts/appGeneratorPrompt.ts` — real system-prompt text for
      the Dual-Engine Architecture (scaffolding for a future live model) plus deterministic
      `matchScenario`/`generateAppSnippet` template synthesis (`acme-order`, `today-itinerary`,
      `default-sandbox`) matching keywords in the incoming prompt, per architect direction to keep
      the pipeline simulated/free rather than wiring a real LLM call.
- [x] Task 7.2 - Build `src/lib/actionKit.ts` — shared registry of the three pre-validated CORS
      APIs (MLB Stats, TheMealDB, Open-Meteo) with schemas + fallback mocks; added as an explicit
      individual entry in `tsconfig.node.json`'s `include` so it type-checks under both the
      browser and server tsconfig projects without duplicating it.
- [x] Task 7.3 - Update `src/server/services/agentStream.ts` — `GET /api/agent/stream` now accepts
      an optional `?prompt=` query param; when present, the Lead Dev stage streams the matched
      scenario's snippet as chunked `generated_app_payload` SSE events (`done: false`) followed by
      one final full-payload event (`done: true`). Omitting `prompt` leaves the existing
      SwarmCanvas/Terminal pipeline shape completely unchanged.
- [x] Task 7.4 - Update `src/lib/sandboxStore.ts` with `connectGenerator(prompt)`: opens its own
      SSE connection, appends intermediate chunks to `state.code` for a live Source-Code-tab typing
      effect, and calls `setCode` on the final chunk to render the complete app in `<AppPreview />`.
      `AppPreview.tsx` now calls `connectGenerator('ACME Order')` on mount instead of seeding a
      static demo string. Doc update, journal entry, & UOW-07 closure.

### [x] UOW-08 - AgentZ Governance Engine & Cryptographic Audit Ledger
- [x] Task 8.1 - Update `.codex/AGENTZ-STUDIO-SDK.md` with sections 6 (Governance Policy Engine —
      System Ceiling vs. User-Defined Policy Bounds) and 7 (Asynchronous Cryptographic Audit
      Ledger — non-blocking queue, SHA-256 Merkle hash-chain, 72-hour retention, live SSE).
- [x] Task 8.2 - Build `src/server/services/policyEngine.ts` — `SYSTEM_CEILING` (20 API calls/min,
      $500 absolute order ceiling, $250 auto-approve ceiling kept deliberately lower so clamping
      never collapses the HITL band to nothing, forbidden-operations list), `checkRateLimit`,
      `checkForbiddenOperation`, `resolveOrderThreshold` (clamps a user-requested auto-approve
      threshold back to the ceiling).
- [x] Task 8.3 - Build `src/server/services/auditLedger.ts` — non-blocking in-memory queue
      (`enqueueAuditEvent`, capacity 200) drained by a `setImmediate`-scheduled background worker
      into a SHA-256 Merkle chain (`Hash_N = SHA256(Hash_N-1 + Timestamp + ActionPayload)`),
      persisted as JSON lines to `.codex/audits/audit-YYYY-MM-DD.jsonl`, pruned by a 72-hour
      retention sweep (startup + every 30 min), and streamed live via `GET /api/audit/stream`.
      Wired into `agentStream.ts`: every stream connection, agent_step, policy check
      (allowed/clamped/denied), and generated_app_payload is now audit-logged.
- [x] Task 8.4 - Build `src/lib/auditStore.ts` + `src/components/AuditLedgerPanel.tsx` — mounted
      as a third panel alongside `Terminal`/`AppPreview` in `App.tsx`; independently re-verifies
      the SHA-256 chain client-side via the Web Crypto API (not a server-reported flag) and shows
      a `Verified Valid` / `Chain Broken` badge. A real race condition was found and fixed in
      `auditStreamHandler` during browser verification (see uow-08.md) — subscribing before
      reading the backlog snapshot, not after, to close a window where concurrently-produced
      blocks could be silently dropped for a given connection. Doc update, journal entry, &
      UOW-08 closure.

### [x] UOW-09 - AgentZ Cookbook Presets, Spectator Mode & SDK Bible Consolidation
- [x] Task 9.1 - Consolidated `.codex/AGENTZ-STUDIO-SDK.md` into the full "AgentZ Bible": added
      the Top-Level Platform Layout diagram, Governance & System Ceilings Matrix, Merkle Hash
      Chain Flow diagram, Single-Active Builder & Spectator Lock Flow diagram, Scenario 3 (B2B
      Lead Scoring Bot), and an AgentZ Cookbook & Session Replay section — with explicit notes on
      where the implementation trims scope against the aspirational layout diagram (no Command
      Drawer / in-app Bible viewer built).
- [x] Task 9.2 - **Full single-active-builder unification (architect-directed)**: refactored
      `agentStream.ts`'s per-request pipeline into one server-wide execution via a new
      `src/server/services/sessionManager.ts` — the first connection claims the builder role and
      actually runs the Planner→Architect→Lead Dev→Reviewer simulation; every other connection
      (a second tab, a Cookbook launch mid-build, a Terminal `run`) becomes a spectator of that
      same run via `broadcastFrame`/`subscribe`, never starting a parallel pipeline.
- [x] Task 9.3 - `src/server/routes/spectatorStream.ts` (`GET /api/agent/spectate`) — always
      spectates, never claims builder; `SwarmCanvas`/`swarmStore.ts` now connect here instead of
      `/api/agent/stream`, so pure visualization can never accidentally win the builder race with
      no prompt attached (which would have silently broken `AppPreview`'s ACME Order boot demo).
- [x] Task 9.4 - `src/lib/cookbookPresets.ts` (3 flagship presets) + `src/components/
      CookbookDropdown.tsx` (header dropdown: one-click preset launch + saved-run instant replay)
      + `src/lib/sessionRoleStore.ts` (drives the header's `🟢 ACTIVE BUILDER` / `👀 SPECTATOR
      MODE` badge). `sandboxStore.ts` gained a shared singleton export so the header dropdown and
      `AppPreview` can trigger/observe the same generation.
- [x] Task 9.5 - `src/server/services/sessionSerializer.ts` + `GET /api/sessions` /
      `GET /api/sessions/:id` — completed builds are serialized to `.codex/demos/[session-id].json`
      once the *entire* pipeline finishes (not right after code generation — an earlier version
      captured the audit slice too early and silently missed the Reviewer stage; fixed by tagging
      every audit event with its owning `sessionId` and filtering on that instead of a timing-
      based index range, which also stays correct when a new build starts immediately after).
- [x] Task 9.6 - Added the B2B Lead Scoring Bot scenario to `appGeneratorPrompt.ts` (weighted
      threshold rules + a simulated outbound webhook alert). Extended `verify-agent-stream.ts`
      with a dedicated spectator-mode test (builder + 2 concurrent spectators mirror the exact
      same `agent_step` sequence; lock releases correctly after completion). Doc update, journal
      entry, & UOW-09 closure.

### [x] UOW-10 - Command Center Drawer, Navigation Polish & AgentZ Bible Viewer
- [x] Task 10.1 - Built `src/components/CommandCenterDrawer.tsx` — replaces the old inline
      Robert/Streaming/Grid header links with a `☰ Command Center` toggle (top-left, next to the
      brand mark) that slides in a left-side drawer with rich cards (icon, description, hover
      state) for NemZilla Studio (marked "Current"), Robert Nemzek, StreamZilla, and GridZilla.
- [x] Task 10.2 - Built `src/components/BibleModal.tsx` + `src/lib/markdown.ts` + a new
      `GET /api/bible` route (`src/server/routes/bible.ts`) reading `.codex/AGENTZ-STUDIO-SDK.md`
      fresh off disk per request (not a build-time bundle — the doc keeps changing UOW over UOW,
      and a static import would show stale content in a running prod server until redeploy).
      `markdown.ts` is a small hand-rolled parser (headings, code fences, bold/inline-code/links,
      lists, GFM tables, hr) rather than a new dependency, consistent with this project's
      no-new-runtime-deps track record.
- [x] Task 10.3 - Restructured `EcosystemNav.tsx`'s header: brand + Command Center on the left;
      `📖 AgentZ Bible`, `Preset Cookbook ▾`, and the builder/spectator badge on the right, with
      `hidden sm:inline` text labels (icon-only below the `sm` breakpoint) and `flex-wrap` so
      nothing clips. Verified via Playwright at 375px (mobile), 768px (tablet), and 1500px
      (desktop) — zero horizontal overflow at any width, zero console errors.
- [x] Task 10.4 - `npx tsc -b` clean, `npm run build` clean, `npm run test:sse` unaffected. Real
      `NODE_ENV=production` boot confirms `/api/bible` serves correctly. Doc update, journal
      entry, & UOW-10 closure.
- [x] Task 10.5 (add-on) - "Save to Cookbook" recipe archiving: `SaveRecipeModal.tsx` (Recipe
      Name / Description / Category Tag form) appears in `AppPreview.tsx`'s header once a build
      is `ready`; `src/lib/recipeStore.ts` persists to `localStorage` (source of truth for
      display) and archives via `POST /api/sessions/save-recipe` →
      `.codex/demos/custom-[recipe-id].json` (`src/server/services/recipeSerializer.ts`, server-
      side validated: id/category whitelisted, name/description/code length-capped).
      `sessionSerializer.ts`'s `listSavedSessions()` now skips `custom-*.json` so the dropdown's
      two sections ("AgentZ Cookbook (saved runs)" vs "⭐ My Saved Recipes") stay distinct.
      `CookbookDropdown.tsx` renders the new section from `recipeState` for instant replay.
- [x] Task 10.6 (add-on) - Audited `.codex/AGENTZ-STUDIO-SDK.md` for all 5 requested diagrams
      (Top-Level Platform Layout §8, Dual-Engine Architecture, Governance Matrix §9, Merkle Chain
      §10, Single-Active Builder Lock §11) — all present. Removed an accidental duplicate copy of
      the Dual-Engine diagram (pre-existing since before UOW-06), corrected section 8's stale note
      claiming the Command Drawer/Bible viewer weren't built (they were, in this same UOW), and
      added section 13 documenting `CommandCenterDrawer.tsx`/`BibleModal.tsx`. `tsc -b`/`build`/
      `test:sse` clean after the add-ons; production boot confirmed `POST /api/sessions/save-recipe`
      validates (400 on bad input, 200 + correct file on valid input).

## [x] UOW 11 - Conversational Swarm Engine & Pluggable Micro-Agents

### Phase 1: Artifact Bundle & Event-Bus Daemon Core
- [x] Task 11.1: Built `src/server/services/sessionBundleRecorder.ts` — writes/reads the 5-file
      bundle (`po-transcript.json`, `project-plan.md`, `catalog.json`, `policy-rules.json`,
      `app-payload.json`) under `.codex/sessions/[session-id]/`, one artifact at a time (so a
      partially-complete interview can persist before the app payload exists), reusing the
      UUID-only `sessionId` validation pattern from `sessionSerializer.ts`/`recipeSerializer.ts` to
      keep path construction safe. Wired `GET /api/sessions/:id/bundle` (assembled bundle, 404 if
      no artifact exists yet) and `PUT /api/sessions/:id/bundle` (`{ artifact, content }` upsert of
      one artifact, shape-validated per key, 400 on bad `sessionId`/artifact key/shape) in
      `src/server/routes/sessionBundle.ts`, mounted in `app.ts` alongside the existing
      `/api/sessions/*` routes. Verified live: full write→read round trip for all 5 artifacts,
      invalid catalog shape, invalid artifact key, and a path-traversal `sessionId` all correctly
      rejected (400); `npx tsc -b` clean.
- [x] Task 11.2: Built `src/server/services/eventBus.ts` — a minimal tagged pub/sub
      (`PipelineEvent` with optional `broadcast`/`audit`/`notify`/`data` tags, each owned by
      exactly one daemon) plus four self-registering passive daemons: `broadcastRelay.ts` (relays
      `broadcast`-tagged events to the SSE fan-out), `auditDaemon.ts` (appends `audit`-tagged
      events to the Merkle chain), `notifierDaemon.ts` (new — turns `notify`-tagged events into a
      `notification` SSE frame; no client UI consumes it yet, that's Phase 2/3), and
      `artifactRecorderDaemon.ts` (reacts to `pipeline_completed`, writing `app-payload.json` via
      Task 11.1's `sessionBundleRecorder.ts` alongside the still-required legacy
      `recordCompletedBuild()` call). All four import for side effects via `daemons.ts`, itself
      imported once from `app.ts`. `agentStream.ts`'s `runPipeline()`/`agentStreamHandler()` and
      `spectatorStream.ts` no longer call `broadcastFrame`/`enqueueAuditEvent`/
      `recordCompletedBuild` directly — every occurrence is now one tagged `emitPipelineEvent()`
      call, with the *emit site* deciding which tags apply (keeping every daemon a fully generic,
      zero-branching forwarder). Verified: `npx tsc -b`/`npm run build` clean; `npm run test:sse`
      green after one intentional allowlist update (the new `notification` event type); a live
      end-to-end run confirmed the audit ledger's hash chain and block shape are byte-for-byte
      unchanged, the legacy `.codex/demos/[id].json` still populates, and the new
      `.codex/sessions/[id]/app-payload.json` now auto-populates via the Artifact Recorder daemon.

### Phase 2: Conversational AI PO Interrogator & Telemetry
- [x] Task 11.3: Built `src/lib/poInterview.ts` — a deterministic finite-state machine
      (`vendor_name -> catalog -> policy_threshold -> complete`, consistent with this project's
      existing pattern of simulating "AI" behavior with real, inspectable logic rather than a live
      model call). Invalid input re-asks the same stage instead of crashing/advancing. Wired into
      `terminalCommands.ts` via two new commands: `build` (starts the interview — every subsequent
      line is routed to the PO as a chat answer, not a shell command, until the interview reaches
      `complete`) and `andiamo` (fetches the persisted session bundle back from the server and
      prints a vendor/catalog/HITL-threshold summary, proving the hand-off package is real).
      `src/lib/sessionBundleClient.ts` is a thin `fetch()` wrapper around Task 11.1's
      `GET`/`PUT /api/sessions/:id/bundle`, matching this project's established pattern (plain
      `fetch()`, not `hc<AppType>`) for the `/api/sessions/*` family. On interview completion, the
      transcript, extracted catalog, and requested HITL threshold are persisted as
      `po-transcript.json` / `catalog.json` / `policy-rules.json` — clamping the threshold to the
      system ceiling is explicitly left to Task 11.6, not done here.
- **Verification:** `npx tsc -b`/`npm run build` clean; `npm run test:sse` unaffected (no
      server-side changes this task). Browser verification hit a pre-existing, environment-level
      dev-server issue unrelated to this task — Vite's dev-mode HMR client was caught (via
      `framenavigated` logging) full-page-reloading the main frame in a tight loop in this
      container, starving every component of stable state before it could render; reproduced
      identically against the unmodified default scenario, ruling out a Task 11.3 regression.
      Switched verification to a `NODE_ENV=production` boot (no Vite middleware at all) instead: a
      full headless-Chromium run drove `build -> "Radio Shack" -> "Mouse Pad|$5, Mouse|$15,
      Macbook Pro|$250" -> "$100" -> andiamo` end to end, zero console errors, and confirmed via
      direct file reads that `po-transcript.json` (8 correctly-ordered entries), `catalog.json`
      (3 items, correct prices), and `policy-rules.json` ($100 HITL/auto-approve, $500 auto-deny)
      all landed on disk byte-correct under `.codex/sessions/[session-id]/`.
- [x] Task 11.4: Added `runSwarmPipeline()` to `agentStream.ts` — a second stage-list runner
      alongside the classic `runPipeline()`, walking `[PO] -> [Architect] -> [Domain
      Micro-Agents] -> [Policy] -> [Lead Dev]` with longer, scannable delays (650ms/stage +
      350ms explicit hand-off beat, vs. the classic pipeline's 150ms) so the hand-offs read as
      distinct beats during a conversational demo. `[Domain Micro-Agents]` is a single
      placeholder stage — Task 11.5 replaces it with real pluggable dispatch; `[Lead Dev]` here
      is reasoning-only (no `generated_app_payload` yet, that also depends on 11.5/11.6). The
      `[Policy]` stage is real, not simulated: calls `resolveOrderThreshold()` from
      `policyEngine.ts` against the interview's requested HITL threshold. Triggered via a new
      `?swarmSessionId=<uuid>` query param on `/api/agent/stream` (mutually exclusive with the
      existing `?prompt=`, validated the same way, 400 on bad format) — reads the completed PO
      interview back via Task 11.1's `readSessionBundle()`, so telemetry text references the
      real vendor name/catalog size/threshold rather than generic copy. Every occurrence emits
      the same tagged `PipelineEvent` shape `runPipeline()` already uses, so Task 11.2's existing
      daemons (broadcast relay, audit, notifier, artifact recorder) all pick this run up with
      zero changes of their own — satisfies "broadcast to the Event Bus" without new wiring.
- **Verification:** `npx tsc -b`/`npm run build` clean; `npm run test:sse` unaffected (classic
      pipeline untouched when `?swarmSessionId` is absent). Live end-to-end runs against the real
      server confirmed: correct 10-event `agent_step` sequence in stage order, 6 `system_alert`
      hand-off messages referencing the real vendor name, a real `policy_check` audit block
      (not clamped at $100), a clamped-with-warning-notification run (requesting $400 against
      the $250 ceiling), a 400 on a malformed `swarmSessionId`, and a graceful error `system_alert`
      (no crash, clean `session_ended`) when the session ID is valid-shaped but no bundle exists.
- **Documented scope trim:** the SwarmCanvas visualization (`SwarmCanvas.tsx`/`swarmStore.ts`)
      still hardcodes the classic 4-node Planner/Architect/Lead Dev/Reviewer layout and silently
      ignores unrecognized agent names — a swarm-mode run's telemetry is fully broadcast and
      audited, but not yet visually rendered on the canvas. Not in this task's numbered scope
      (`/api/agent/stream` broadcast, not canvas rendering); flagged as Risk/Debt below.

### Phase 3: Pluggable Domain Micro-Agents & "Andiamo!" Hand-off
- [x] Task 11.5: Built `src/server/services/domainAgents.ts` — a pluggable registry of 6 domain
      micro-agents (`AI Vendor`, `AI OE`, `AI TODO`, `AI Sport`, `AI SS`, `AI Food`), each a
      self-contained `{ agent, detect, run }` tuple. `AI Vendor`/`AI OE` are always-dispatched
      (every PO interview is fundamentally an order-entry app); the other 4 are genuinely
      conditional — deterministic keyword matching (mirroring `appGeneratorPrompt.ts`'s
      `matchScenario()`) against the interview's vendor name and catalog item names (e.g. "task"/
      "todo" -> `AI TODO`, "sport"/"game"/"team" -> `AI Sport`, "movie"/"stream"/"watch" -> `AI SS`,
      "food"/"recipe"/"meal" -> `AI Food`). `dispatchDomainAgents()` filters + maps the registry in
      order — adding a 7th agent later means adding one registry entry, never touching the
      dispatcher. Each dispatched agent returns a structured `schema` fragment (e.g. AI Sport ->
      `{ type: 'sportsWidget', source: 'ESPN', teams: [] }`) plus a `summary` used as its Swarm
      Canvas reasoning text.
- **Wired into `runSwarmPipeline()` (Task 11.4):** replaced the single `[Domain Micro-Agents]`
      placeholder stage with a real, variable-length sub-sequence — one `agent_step`/`token_stream`/
      `metric_tick` beat per dispatched agent, hand-off-narrated between each (`AI Vendor` ->
      `AI OE` -> ... -> `Policy`). Refactored the repeated EXECUTING/tokens/metric/DONE beat into a
      shared `runSwarmStage()` helper (used by both the fixed named stages and the dynamic domain-
      agent loop) plus a `swarmHandoff()` helper, replacing the old flat loop over a fixed 5-entry
      array. Each domain agent's `schema` fragment is embedded directly in its `agent_step` audit
      payload — the audit ledger becomes the tamper-evident record of exactly what each agent
      contributed. `Policy`'s audit payload and `Lead Dev`'s reasoning text both now reference the
      full dispatched-agent list, satisfying "feed directly into AI Policy and AI Lead Dev" without
      yet performing real code synthesis (still Task 11.6).
- **Verification:** `npx tsc -b`/`npm run build` clean; `npm run test:sse` unaffected (classic
      pipeline untouched). Live end-to-end proof of *genuine* dynamic dispatch: a plain retail
      catalog ("Mouse Pad", "Mouse") dispatched exactly `AI Vendor, AI OE`; a catalog engineered to
      hit every keyword category ("Game Day Ticket Bundle", "Chicken Wing Recipe Kit", "Movie
      Night Streaming Pass", "Weekly Task Checklist Pad") dispatched all 6 agents in registry
      order, with correct hand-off narration end to end (`PO -> Architect -> AI Vendor -> AI OE ->
      AI TODO -> AI Sport -> AI SS -> AI Food -> Policy -> Lead Dev`), `Lead Dev`'s reasoning text
      correctly listing all 6, and each domain agent's structured schema fragment (e.g. AI Sport's
      `{type: sportsWidget, source: ESPN, teams: []}`) verified present and correct in the audit
      ledger's `agent_step` blocks.
- [x] Task 11.6: **Code synthesis** — `src/server/services/swarmCodeSynthesizer.ts`'s
      `synthesizeOrderEntryApp()` consumes the aggregated session bundle (catalog + resolved
      policy ceiling + dispatched domain agent labels) to generate a real, executable order-entry
      micro-app (HTML/Tailwind/JS), parameterized dynamically by the actual interview data instead
      of a fixed scenario template — reuses UOW-07's exact Dual-Engine app shape (catalog, cart,
      HITL modal, virtual notification drawer). HTML-escapes the vendor name and JSON-embeds the
      catalog (with `<` neutralized) since this is now user-supplied interview data, not a trusted
      hardcoded template. Wired into `runSwarmPipeline()`'s Lead Dev stage: streams the result as
      chunked `generated_app_payload` events identical in shape to the classic pipeline's, then
      emits `pipeline_completed` with a new `bundleSessionId` field so the Artifact Recorder daemon
      (Task 11.2) writes `app-payload.json` into the *interview's own* session bundle folder
      rather than a new one keyed by the ephemeral builder-lock id — `artifactRecorderDaemon.ts`
      updated accordingly (uses `bundleSessionId` for the payload write, the builder-lock id for
      audit-block correlation, since those two ids are now genuinely different for swarm runs).
- **"Andiamo!" launch wiring** — `sandboxStore.ts` gained `connectSwarmGenerator(swarmSessionId)`
      (opens `/api/agent/stream?swarmSessionId=...`, sharing 100% of `connectGenerator`'s existing
      SSE-parsing logic via a new shared `connectToStream()` helper — the `generated_app_payload`
      event shape is identical, so zero new client-side parsing was needed). `terminalCommands.ts`'s
      `andiamo` command now calls `sandboxStore.connectSwarmGenerator(...)` after printing the
      hand-off summary, launching the swarm build live into `<AppPreview/>` exactly the way
      `CookbookDropdown.tsx` already triggers builds — same shared singleton, same
      single-active-builder semantics (a build already active elsewhere makes this a spectator,
      not a competing build).
- **Live policy enforcement + Merkle audit trail** — the synthesized app's own inline JS evaluates
      the *real* interview-derived HITL threshold at checkout (auto-approve/HITL-required/auto-deny
      bands, same logic as the ACME template) and reports every decision
      (`auto_approved`/`hitl_pending`/`hitl_approved`/`hitl_denied`/`auto_denied`) back to the
      parent via `postMessage` (new `SANDBOX_MESSAGE.order` constant). `sandboxStore.ts` relays
      this to a new `POST /api/orders/event` (`src/server/routes/orders.ts`), which validates
      strictly (UUID sessionId, bounded numeric total, whitelisted decision) and calls
      `enqueueAuditEvent()` **directly** rather than through `eventBus.ts` — deliberately, since an
      order can be placed long after the swarm session that generated the app has ended, and
      routing it through the bus's `notify`/`broadcast` tags would call
      `sessionManager.broadcastFrame()` outside any active session, silently polluting the *next*
      unrelated build's initial backlog.
- **Verification:** `npx tsc -b`/`npm run build` clean; `npm run test:sse` unaffected. Live curl-
      driven checks: swarm-generated code contains the real vendor/catalog/ceilings/session id;
      `app-payload.json` lands in the interview's own bundle folder while the legacy
      `.codex/demos/[id].json` record still correlates by the correct builder-lock id (16 audit
      blocks); `/api/orders/event` correctly enqueues `allowed`/`denied`-mapped audit blocks and
      rejects malformed input (400). **Full live browser verification** (production-mode Playwright,
      per Task 11.3's established environment workaround): typed the complete interview (`build` →
      vendor → catalog → threshold → `andiamo`) into the real `nemzilla-cli`, confirmed the swarm
      build rendered into `<AppPreview/>`'s iframe with the real catalog, added the $250 item
      (landing in the $150–$500 HITL band), confirmed the HITL modal appeared, approved it,
      confirmed the "order shipped" notification — and confirmed server-side afterward that both
      `hitl_pending` and `hitl_approved` order-decision audit blocks were recorded against the
      correct session, hash-chained correctly. Zero console errors throughout.
- **UOW-11 complete.** All 6 tasks across all 3 phases shipped: session bundle recorder + event
      bus refactor (Phase 1), conversational PO interviewer + swarm telemetry (Phase 2), pluggable
      domain micro-agents + Andiamo launch with live policy enforcement (Phase 3).

## [x] UOW 12 - Pass A: Conversational UX Polish, Telemetry Deck & Swarm Pipeline Feedback
_(Note: a prior session's LLM-driven PO/domain-agent refactor — referenced in that session as
"UOW-13" — landed on top of UOW-11 before this UOW started, but was never logged to this tracker.
Its result is visible in `poInterviewLLM.ts`/`domainAgents.ts`/`anthropicClient.ts` and is the
foundation this UOW builds on; flagging the tracker gap here rather than silently ignoring it.)_

- [x] Task 12.1: **Removed the "andiamo" secret-word requirement.** `poInterviewLLM.ts`'s
      `SYSTEM_PROMPT` now tells the user, once all three fields are confirmed: "Ready to build your
      app? Click 'Build' below or type 'build' to launch it." — no more instruction to type a magic
      word. `terminalCommands.ts` gained `LAUNCH_TRIGGER_PHRASES` (build, build it, go, looks good,
      make the app, ship it, launch, andiamo, and a few more) checked via `isLaunchTrigger()`
      immediately once `activeInterview?.done`, *before* the command switch — this ordering matters:
      without it, typing the bare word "build" post-completion would hit the switch's `case 'build'`
      and silently start a second, unrelated interview, discarding the completed one. `andiamo`
      itself still works — it's just one entry in the trigger set now, not documented in `help`.
      New `src/lib/interviewStore.ts` mirrors `terminalCommands.ts`'s plain-mutable `activeInterview`
      into a real Solid store (`publishInterviewSnapshot()`, called after every start/turn/cancel) so
      other components can react to it — `Terminal.tsx` uses it to render a "Ready to build your
      app? Click Build" button once the interview is done, wired to the exact same `runCommand`
      code path as typing the phrase.
- [x] Task 12.2: **Artifacts & Telemetry Deck.** New `src/components/ArtifactsPanel.tsx`, added as
      a 3rd tab ("Artifacts / Telemetry") extending `AppPreview.tsx`'s existing Preview/Source tab
      bar (per the DoD's "extend the tab bar" wording) rather than a new standalone panel — keeps
      the same chrome, no grid-layout changes. Four sub-tabs: **Discovery Transcript** (live off
      `interviewState`), **Prompt & Payload Inspector** (accordion: System Prompt — fetched once
      from a new read-only `GET /api/po/interview/meta`, since duplicating the real prompt string
      client-side would drift; User Inputs; Extracted JSON for `catalog`/`policyRules`), **Agent
      Trace** (chronological `agent_step`/`policy_check`/`generated_app_payload` entries, sourced
      from the audit ledger — works for both the classic and swarm pipelines since it renders
      whatever `action`/`payload.agent` strings actually arrive rather than assuming a fixed agent
      list), and **Run History** (Task 12.4). `auditStore.ts` gained a bottom-of-file singleton
      export (same pattern as `sandboxStore.ts`) so `AuditLedgerPanel.tsx` and `ArtifactsPanel.tsx`
      share one `/api/audit/stream` connection instead of each opening their own (a second `.connect()`
      call on an independent instance would reset the other's `blocks` out from under it).
- [x] Task 12.3: **Active Swarm Pipeline Visualization, wired to real execution.** Rewrote
      `swarmStore.ts`/`SwarmCanvas.tsx` to render *whichever* pipeline is actually running instead
      of a hardcoded 4-node Planner/Architect/Lead Dev/Reviewer layout — `AgentName` is now `string`,
      and `SwarmState.stageOrder` grows dynamically as real agent names announce themselves
      (`PO`/`Architect`/`AI Vendor`/`AI Sport`/.../`Policy`/`Lead Dev` for a swarm run, unchanged for
      a classic `run`/`triad`). Node count self-scales (radius 30/24/20 at ≤4/≤6/>6 nodes) since a
      swarm run can have up to 8 stages. `RUN_START_AGENTS` (`Planner`, `PO`) triggers a full
      client-side reset the instant either pipeline's first stage starts, so back-to-back runs never
      bleed into each other. Curated micro-status badges (e.g. "Synthesizing UI...", "Compiling
      blueprint...") render under the active/thinking node, falling back to a generic
      `"Modeling {agent} schema..."` for any not-explicitly-listed domain agent. **Real bug found and
      fixed during verification, not new in this UOW:** `/api/agent/spectate` is a genuinely
      per-build stream by design (closes with `session_ended` once its build ends — asserted by
      `scripts/verify-agent-stream.ts`), but `swarmStore.ts`'s `connect()` was one-shot — it never
      reconnected, so the canvas silently froze on whatever run happened to be active when the page
      first loaded and never saw anything after (confirmed live: the page-load auto-`ACME Order` run
      finished, and the canvas never advanced past its final frame even once the swarm build's real
      events were flowing correctly through the audit ledger/Agent Trace view). Fixed client-side —
      `connect()` now loops, transparently reconnecting after each natural stream close — rather
      than touching `serveSessionStream()`'s server-side session-scoped-spectate contract, which the
      existing test suite depends on and which other spectators (e.g. a second browser tab) rely on
      too.
- [x] Task 12.4: **Persistent Run Saving ("Save Run").** New `src/lib/runHistoryStore.ts` —
      `localStorage`-only (no server round-trip; a personal per-browser run history, distinct from
      `recipeStore.ts`'s code-only, server-archived "Save to Cookbook"). `saveRun()` captures the
      full bundle: discovery transcript, extracted `catalog`/`policyRules`, this run's own audit
      ledger blocks, and the generated app code. Surfaced via `ArtifactsPanel.tsx`'s Run History
      sub-tab: `📦 Save Run` (gated on `sandbox.state.status === 'ready'`, matching
      `SaveRecipeModal.tsx`'s existing gate), and per-row `View` (switches Transcript/Inspector/Trace
      to a read-only historical view of that run with a "Viewing saved run — Back to Live" banner,
      via a local `viewedRun` signal — deliberately *not* touching the live `interviewState`, so
      inspecting an old run can never be confused with, or interfere with, an in-progress interview),
      `Load` (pushes the run's code into `<AppPreview/>` via the existing `sandboxStore.setCode()`),
      and `✕` (delete).
- **Verification:** `npx tsc -b`/`npm run build` clean; `npm run test:sse` unchanged and passing
      (the spectate-stream investigation above was resolved without touching any server-side
      streaming code, so the suite's session-scoped-spectate assertions still hold exactly as
      written). Full live browser verification (production-mode Playwright, per the project's
      established environment workaround): three complete discovery interviews end to end (a
      bakery, a hardware store, a sports-team fan shop), confirming (a) the new CTA copy appears
      verbatim and the "Ready to build" button correctly launches the swarm build; (b) `AI Sport`
      correctly dispatches for the sports-merchandise vendor while only the always-on `AI Vendor`/
      `AI OE` dispatch for the hardware store; (c) the Swarm Canvas grows live from 2→4→6→8 nodes
      through a real swarm run with correct pulse/glow/micro-status badges and a clean reset from
      the page-load classic run into the swarm run; (d) Discovery Transcript, the Prompt & Payload
      Inspector's three accordion sections (including the live-fetched real system prompt), and
      Agent Trace all render correct live data; (e) Save Run → Run History → View (banner + correct
      historical transcript) → Back to Live → Load, end to end, zero console errors throughout.
      One test-harness-only false alarm during this pass, not a product bug: a Playwright
      `button:has-text("View")` selector was inadvertently matching the "App Preview" tab button too
      (`"Preview"` contains the substring `"view"`) — resolved by switching the test to an exact-text
      role query; no application code was at fault.
- **UOW-12 complete.** All 4 Pass A requirements shipped, plus one genuine pre-existing spectate-
      stream reconnection bug found and fixed along the way.

## [x] UOW 13 - Pass B: The Step-by-Step Replay Scrubber
_(Note: this is the first session to log a UOW numbered 13 to this tracker — an earlier, unlogged
session informally called its own work "UOW-13" before this one; that work is documented under
UOW-12's note above instead, and is unrelated to this one.)_

- [x] Task 13.1: **Replay Mode Controller.** New `src/lib/replayStore.ts` — a global singleton
      (`run`, `steps`, `stepIndex`, `playing`, `speed`) driving Replay Mode from anywhere in the
      tree. `steps` is a saved run's `auditBlocks` filtered to `AGENT_TRACE_ACTIONS` (moved from
      `ArtifactsPanel.tsx` into a shared export on `auditStore.ts` so the Agent Trace tab and the
      replay scrubber always agree on what counts as a "step"). `ArtifactsPanel.tsx`'s Run History
      tab gained "▶ Replay Current Run" (replays whatever's live right now, no Save Run required —
      builds an ephemeral `SavedRun`-shaped object from the same reactive sources `handleSaveRun`
      already reads) and a per-row "▶ Replay" button; a banner ("▶ Replaying: {name}") appears with
      an Exit Replay action, mirroring the existing "Viewing saved run" banner's pattern.
- [x] Task 13.2: **Visual Packet Trajectory.** `swarmStore.ts` gained `buildReplaySnapshot(steps,
      uptoIndex)`, folding a run's `agent_step` blocks up to the scrubbed index through the exact
      same `ensureAgent()`/`RUN_START_AGENTS` reducer the live store's `dispatch()` already uses —
      a replayed run renders identically to how it looked live instead of a second parallel state
      machine. `SwarmCanvas.tsx` now reads a `view()` memo (replay snapshot when `replayState.run`
      is set, else the live store) for every node/edge render, pauses the live `/api/agent/spectate`
      connection while replaying (and resumes it on Exit) via a `createEffect` gating
      `swarm.connect()`, and renders a "Step X of Y" scrubber header (Back / Play·Pause / Forward,
      1x/2x speed, Exit) plus a small amber dot that tweens between each hand-off's source/target
      node positions over ~900ms (a plain `requestAnimationFrame` tween, not SVG `<animateMotion>`,
      to sidestep cross-browser SMIL-restart quirks) and an amber pulsing ring around whichever
      node(s) the current step touches.
- [x] Task 13.3: **Contextual Packet Inspector.** A panel under the canvas shows the current
      step's `action`/`timestamp`/JSON `payload`; hovering a different node looks up that agent's
      own most recent `agent_step` at-or-before the scrubbed index instead (falls back to "no step
      data" if that agent hasn't acted yet at this point in the replay).
- [x] Task 13.4: **Runtime Policy Interceptor Visual.** New `src/lib/policyTrajectoryStore.ts`
      drives a brief 3-stage trajectory ("Cart Submitted" → "Policy Checked ($X · decision)" →
      "Audit Ledger Signed") rendered as a bar above the iframe in `AppPreview.tsx`, triggered by
      the same `SANDBOX_MESSAGE.order` postMessage `sandboxStore.ts` already relays to
      `/api/orders/event` — auto-hides ~1.8s after the final stage. Along the way, extended
      `buildAcmeOrderSnippet()` (`appGeneratorPrompt.ts`) to post that same order-decision message
      the swarm-synthesized apps already did (`swarmCodeSynthesizer.ts`) — previously only a
      completed PO-interview build could demonstrate this at all; now the default "ACME Order" boot
      demo can too. Threaded the classic pipeline's own builder-lock `sessionId` (already a
      `crypto.randomUUID()`) through `generateAppSnippet()` into the snippet so its order-decision
      relay validates against `isValidSessionId()` the same way the swarm path's does.
- **Real bug found and fixed, not new in this UOW:** `SwarmCanvas.tsx`'s node glow (`STATUS_GLOW`)
      used an inline `style={{ filter: ... }}`, which production's CSP (`style-src 'self'`, no
      `unsafe-inline` — `securityHeaders.ts`) silently drops — the glow effect had never actually
      rendered in production despite earlier UOWs claiming "zero console errors" (their test flows
      apparently never happened to trigger/check for this specific message). Found via this UOW's
      own Playwright pass after adding one more instance of the same pattern for the packet dot.
      Fixed both by moving to Tailwind arbitrary-value classes (`drop-shadow-[...]`), which compile
      into the external stylesheet rather than an inline attribute.
- **Verification:** `npx tsc -b`/`npm run build`/`npm run test:sse` all clean. Full production-mode
      Playwright pass (`NODE_ENV=production`, per this project's established dev-server-HMR-loop
      workaround): confirmed the boot demo's ACME order flow renders the 3-stage governance
      trajectory end to end with the correct decision label and auto-hide timing; confirmed Replay
      Current Run's banner, the Swarm Canvas scrubber (Step X of Y, Play/Pause/Forward/Back, both
      speeds), the packet dot appearing precisely on hand-off (`EXECUTING`) steps with both
      endpoint nodes ringed and persisting correctly through non-hand-off inspector-only steps
      (`policy_check`, `generated_app_payload`) until the corresponding `DONE`, the Packet Inspector
      updating on node hover, and Exit correctly restoring live mode — zero console errors after the
      CSP fix above.
- **UOW-13 complete.** All 4 Pass B requirements shipped, plus one genuine pre-existing CSP/inline-
      style bug found and fixed along the way.

