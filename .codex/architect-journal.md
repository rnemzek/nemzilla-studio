# Lead Architect Journal — NemZilla Studio (`nemzilla.net`)

## System Identity & Core Objective
- **Target:** Flagship interactive portal for `nemzilla.net`.
- **Core Purpose:** High-impact showcase of real-time multi-agent AI orchestration, SSE streaming telemetry, and interactive web desktop/terminal UI.
- **Primary Metrics:** 60fps UI streaming updates, zero VDOM overhead via SolidJS, strict security CSP/HSTS, and sub-100ms response times.

---

## Architect Sync History

### Session Initialization — 2026-07-21
- **Project Initialized:** Baseline directory structure established with modular context architecture (`.codex/journals/` isolated to prevent context bloat).
- **Target Stack:** SolidJS + Hono RPC + `Hono streamSSE` + Tailwind CSS.
- **Current Milestone:** Ready for UOW-01 execution (Scaffolding & Server Setup).

### UOW-01 Sync — Repository Initialization & Core Architecture — 2026-07-21
- **Scaffold:** Vite + SolidJS + TypeScript project generated; demo boilerplate stripped.
- **Server Mount:** Hono app (`src/server/app.ts`, `basePath('/api')`) bridged into a Node
  `http` server that routes `/api/*` to Hono and all else to Vite's dev middleware.
- **Prod Path:** Hono's own `serveStatic` serves `dist/` with an `index.html` SPA fallback,
  booted via `@hono/node-server`'s `serve()` — one process, no separate static host.
- **Design Tokens:** Tailwind v4 (`@tailwindcss/vite`) wired in; `@theme` defines a dark
  palette (bg/surface/border/text/accent) plus a `radial-glow` utility and base typography.
- **Health Check:** `GET /api/health` live, returning `{ status, uptime, timestamp }`.
- **Env:** `.env.sample` documents `PORT`, `NODE_ENV`, `LOCALHOST_IP`.
- **Verification:** `tsc --noEmit` clean; `npm run build` clean; manual curl checks passed
  for `/`, `/api/` (404 sanity), and `/api/health` (200).
- **Security Note:** Bumped `@hono/node-server` to `^2.0.11` during install — v1 carried a
  moderate path-traversal advisory (GHSA-frvp-7c67-39w9) in `serve-static`.
- **Risk/Debt:** No `tailwind.config.js` needed (v4 CSS-first config) — future UOWs should
  keep tokens in `src/index.css`'s `@theme` rather than reintroducing a JS config.
- **Next Milestone:** UOW-02 — Hono SSE Engine & Telemetry Pipeline.

### UOW-02 Sync — Hono SSE Engine & Telemetry Pipeline — 2026-07-21
- **Stream Service:** `src/server/services/agentStream.ts` uses `streamSSE` to emit
  `agent_step` / `token_stream` / `metric_tick` / `system_alert`, mounted at
  `GET /api/agent/stream`.
- **Pipeline:** Simulated `Planner -> Architect -> Lead Dev -> Reviewer` walk — each stage
  emits EXECUTING, token-by-token reasoning text, a latency/memory `metric_tick`, then DONE.
- **Abort Safety:** `stream.onAbort()` flips a flag checked between awaits so a disconnected
  client halts the simulation promptly instead of finishing in the background.
- **Verification Script:** `scripts/verify-agent-stream.ts` (`npm run test:sse`) spawns the
  real server, drives it purely over `fetch`, and validates full-pipeline event structure/
  ordering plus abort-then-recover behavior (single abort + 5 concurrent aborts, then a
  clean full pipeline run) as the practical proxy for "zero connection leaks."
- **Result:** 49 SSE frames validated per full run; server stayed responsive through both
  abort scenarios; spawned child process confirmed to exit cleanly post-test.
- **Verification:** `tsc --noEmit` clean; `npm run build` clean; `npm run test:sse` all green.
- **Risk/Debt:** Per-connection event `id` counters are closure-local (correct per SSE spec
  for the `Last-Event-ID` reconnect model) — don't refactor to a shared/module-level counter
  in later UOWs without re-checking that semantics.
- **Next Milestone:** UOW-03 — Interactive Terminal Shell (`nemzilla-cli`).

### UOW-03 Sync — Interactive Terminal Shell (`nemzilla-cli`) — 2026-07-21
- **Component:** `src/components/Terminal.tsx` — bordered CLI window, scrolling output log,
  single-line prompt; `createStore` + `produce()` for append-only log growth, `createEffect`
  auto-scroll keyed on `lines.length`, Up/Down history recall, click-anywhere-to-focus.
- **Parser:** `src/lib/terminalCommands.ts` — `help`, `run [task]` (verbose stream), `triad`
  (condensed stream), `metrics`, `launch [target]`, `clear`; kept separate from the
  component so UI stays render/input-only.
- **RPC:** `src/lib/apiClient.ts` exports one `hc<AppType>` client shared by `metrics`
  (`/api/health`, with client-measured round-trip latency) and the stream commands
  (`/api/agent/stream`, read via `res.body`'s reader).
- **tsconfig Decision:** Added `"node"` to `tsconfig.app.json`'s `types` so the browser
  project can elaborate the `import type { AppType }` cross-import (it references
  `process.uptime()` inside `app.ts`). Type-only, no runtime effect — documented in
  `uow-03.md` for whoever touches this boundary next.
- **Browser Verification:** No project run-skill existed; used dev server + a throwaway
  Playwright driver (scratchpad-only, not committed) to click through the real UI —
  initial render, `help`, `metrics`, `triad`, history nav, `clear`, zero console errors.
  Caught and fixed a real bug this way: terminal output was inheriting `text-center` from
  the page's hero wrapper; fixed with `text-left` on the terminal section.
- **Verification:** `tsc --noEmit` clean; `npm run build` clean (`tsc -b` caught one real
  `noUnusedParameters` violation, fixed); `npm run test:sse` re-run clean (no regression).
- **Risk/Debt:** No project-level browser-run skill exists yet — suggest
  `/run-skill-generator` if browser verification becomes routine across future UOWs
  (UOW-04's Swarm Canvas will need visual checks too).
- **Next Milestone:** UOW-04 — Multi-Agent Swarm Canvas UI.

### UOW-04 Sync — Multi-Agent Swarm Canvas UI — 2026-07-21
- **Re-scoping:** Tasks 4.2/4.3 were redirected in-session from the original roadmap
  wording — 4.2 became force-directed layout, 4.3 became SSE store wiring (swapping their
  original order); the original 4.3 spec (click-to-view reasoning log) is deferred, not
  built. Full detail in `uow-04.md`.
- **Canvas:** `src/components/SwarmCanvas.tsx` — SVG pipeline (Planner → Architect → Lead
  Dev → Reviewer) with an accent-animated forward path and a dotted Reviewer→Planner
  feedback arc; mounted in `App.tsx` next to `Terminal`.
- **Physics:** `src/lib/swarmLayout.ts` — repulsion + spring links + centering + a
  non-alpha-scaled anchor spring per node, so the graph always relaxes back onto the
  straight pipeline layout regardless of starting jitter. Verified numerically (5 random
  starts, <0.2px anchor error, 0.000px y-spread) — not just eyeballed.
- **Live State:** `src/lib/swarmStore.ts` — parses `/api/agent/stream` into per-agent status
  (`idle/active/thinking/completed/error`) and per-edge activity; replaces the 4.1
  placeholder `activeAgent` prop as the canvas's live source of truth.
- **Verification:** Re-ran the UOW-03 run-skill driver fresh — screenshots confirm all four
  nodes reach the glowing green `completed` state via the real SSE pipeline, zero console
  errors. `tsc --noEmit` clean, `npm run build` clean, `npm run test:sse` clean.
- **Risk/Debt:** Swarm canvas and terminal each open independent stream connections (not
  synchronized); `swarmStore.ts` doesn't retain per-agent token history yet, so the deferred
  click-to-view-reasoning feature needs that added first.
- **Next Milestone:** UOW-05 — Ecosystem Portal & Production Hardening.

### UOW-05 Sync — Ecosystem Portal & Production Hardening — 2026-07-21
- **Nav:** `src/components/EcosystemNav.tsx` — top bar with brand mark and a three-link
  ecosystem quick-launch dock (`robert` / `streaming` / `grid` `.nemzilla.net`), mounted above
  the main content in `App.tsx`; the same three targets are also reachable via `nemzilla-cli`'s
  existing `launch [target]` command.
- **Security Headers:** `src/server/middleware/securityHeaders.ts` — no-op in dev
  (`NODE_ENV !== 'production'`), strict CSP + `X-Frame-Options: DENY` + HSTS
  (`includeSubDomains; preload`) + `nosniff` + `strict-origin-when-cross-origin` referrer
  policy in prod, wired as global middleware in `src/server/app.ts`.
- **Production Routing Bug (found + fixed this UOW):** `app.ts`'s `.basePath('/api')` call
  scoped every route registered on that Hono instance afterward — including the static-file
  serving routes `server.ts` adds for production — under `/api/*`. Real `NODE_ENV=production`
  boot returned 404 on `GET /`; the built SPA was completely unreachable, and (as a side
  effect) `securityHeaders()` was silently prod-scoped to API responses only, never the actual
  page load. Fixed by dropping `.basePath()` in favor of explicit `/api/health` /
  `/api/agent/stream` paths on an unscoped `app` — no client-side (`hc<AppType>`) changes
  needed. Verified via a real prod boot: `GET /` 200 with all headers + SPA root div,
  `GET /assets/*` 200, `GET /api/health` 200, arbitrary deep route 200 via SPA fallback.
- **Verification:** `tsc -b` clean, `npm run build` clean, `npm run test:sse` clean, fresh
  Playwright driver run (`help metrics "launch grid" triad clear`) zero console errors —
  screenshots confirm the nav bar renders correctly alongside the swarm canvas and terminal.
- **Risk/Debt:** No committed automated check exercises the production (`NODE_ENV=production`,
  built `dist/`) boot path — this UOW's prod verification was manual curl testing. A follow-up
  `verify-prod-boot.ts` (mirroring `verify-agent-stream.ts`) would catch a routing regression
  like the one found here automatically.
- **UOW-05 complete.** Roadmap has no further UOWs queued — next milestone is whatever the
  user scopes next.

### UOW-06 Sync — AgentZ Studio Sandbox Preview Engine — 2026-07-22
- **Deviation from spec (architect-directed):** Literal `srcdoc` would inherit UOW-05's strict
  prod CSP (`frame-ancestors 'none'`, `script-src 'self'`), blocking the iframe from rendering at
  all — same works-in-dev/breaks-in-prod class as UOW-05's own routing bug. Built as directed:
  a same-origin `GET /sandbox-frame` route with its own scoped CSP instead.
- **Route:** `src/server/routes/sandboxFrame.ts` serves a bootstrap shim; `securityHeaders.ts`
  exempts that one path (its `c.header()` calls run after the route handler's, so without the
  exemption the strict global CSP would silently clobber the route's own in prod).
- **Template:** `src/lib/sandboxTemplate.ts` — `buildSandboxDocument()` wraps snippets in an
  envelope (Tailwind CDN, Inter font, `window.onerror`/`unhandledrejection` -> postMessage).
- **Store:** `src/lib/sandboxStore.ts` — `ready -> code -> rendered/error` postMessage handshake;
  code changes force a cache-busted iframe reload (`document.write` tears down listeners, so a
  second write on the same load can't be heard without one).
- **Isolation:** iframe stays `sandbox="allow-scripts"` (no `allow-same-origin`) — opaque origin
  regardless of same-origin URL; the route's permissive CSP is secondary, not the real boundary.
- **Verification:** `tsc -b` clean, `npm run build` clean, real `NODE_ENV=production` boot
  confirmed both CSPs coexist (main app fully strict, `/sandbox-frame` scoped-permissive),
  Playwright confirmed Tailwind/Inter render correctly inside the sandboxed frame, zero console
  errors on the existing terminal/swarm smoke run.
- **Risk/Debt:** No automated check for `/sandbox-frame` yet (manual verification only, same gap
  UOW-05 noted for prod-boot generally); `setCode()` has no real generation source wired in yet
  (demo snippet only); updates are full-reload, not flicker-free.
- **Next Milestone:** whatever the user scopes next.

### UOW-07 Sync — AgentZ Dynamic App Generator & Hybrid Action Engine — 2026-07-22
- **Pre-flight fixes (architect-directed):** Renamed `AGENTZ-STUDIO-SDK.md.bak` -> `.md` (repo
  state now matches "locked in"). Confirmed no LLM SDK/API key exists anywhere in this repo, so
  kept generation fully simulated/deterministic rather than wiring a real model call — consistent
  with every other agent step, zero new cost or secrets.
- **Action Kit:** `src/lib/actionKit.ts` — MLB Stats, TheMealDB, Open-Meteo registry with schemas
  + fallback mocks. Confirmed via `curl -H "Origin: null"` that all three send
  `Access-Control-Allow-Origin: *`, so fetches from the sandbox's opaque origin actually work.
- **Prompt architecture:** `src/server/prompts/appGeneratorPrompt.ts` — real Dual-Engine system
  prompt text (scaffolding for a future live model) plus deterministic `matchScenario` /
  `generateAppSnippet` template synthesis for `acme-order` / `today-itinerary` / `default-sandbox`.
- **Stream:** `agentStream.ts`'s `GET /api/agent/stream` now takes an optional `?prompt=`; when
  present, Lead Dev streams the matched snippet as chunked `generated_app_payload` events (`done:
  false` then one final `done: true`). No param -> zero change to the existing pipeline shape.
- **Sandbox wiring:** `sandboxStore.ts` gained `connectGenerator(prompt)` — appends chunks live to
  `state.code` (Source Code tab "typing" effect), calls `setCode` on the final chunk to render.
  `AppPreview.tsx` now boots with `connectGenerator('ACME Order')` instead of a static demo string.
- **tsconfig:** added `src/lib/actionKit.ts` as an explicit file entry in `tsconfig.node.json`'s
  include (not the whole `src/lib` dir, which would've pulled DOM-typed files into the server
  project) — first genuinely shared client/server module in this repo.
- **Verification:** `tsc -b`/`build` clean; `test:sse` extended with a prompt-path test (194
  chunked frames, correct final scenario) alongside the unchanged original assertions; real prod
  boot confirmed the strict CSP is untouched on this route; Playwright **interacted** with the
  live generated ACME app (added items, triggered the $100–$500 HITL tier, approved, confirmed the
  notification drawer) and separately confirmed all three live API fetches in the Itinerary
  scenario resolve with real data.
- **Risk/Debt:** `AppPreview` now opens a third independent `/api/agent/stream` connection
  alongside `SwarmCanvas`'s (extends UOW-04's already-noted debt); the itinerary snippet's fetch
  fallbacks are hand-kept in sync with `actionKit.ts` rather than sharing it (plain string
  template, can't import); `matchScenario` is coarse keyword matching, not real intent parsing.
- **Next Milestone:** whatever the user scopes next.

### UOW-08 Sync — AgentZ Governance Engine & Cryptographic Audit Ledger — 2026-07-22
- **Spec:** `.codex/AGENTZ-STUDIO-SDK.md` gained sections 6 (Governance Policy Engine) and 7
  (Audit Ledger), written to match what was actually built, including the mid-build fix below.
- **Policy engine:** `src/server/services/policyEngine.ts` — `SYSTEM_CEILING` (20 calls/min, $500
  absolute order ceiling, forbidden-ops list) plus a **separate, lower** $250 auto-approve ceiling.
  Splitting those two was a fix, not the original design: clamping a requested auto-approve
  threshold to the *same* value as the deny boundary produced a degenerate "HITL required between
  $500 and $500" — caught by actually reading a generated app's own copy, not code review alone.
- **Audit ledger:** `src/server/services/auditLedger.ts` — non-blocking ring-buffer queue drained
  by a background worker into a SHA-256 Merkle chain (`Hash_N = SHA256(Hash_N-1 + Timestamp +
  Payload)`), persisted to `.codex/audits/*.jsonl`, pruned by a 72-hour retention sweep, streamed
  live via `GET /api/audit/stream`. Wired into every `agentStream.ts` connection/step/policy-check.
- **Real bug found via browser verification, not just server-side testing:** an independent
  Node script recomputing every hash directly against the live server found the chain
  cryptographically perfect — yet loading the actual page reliably showed `Chain Broken`. Root
  cause: `auditStreamHandler` read its backlog snapshot, then subscribed to live blocks — any
  block produced in that gap (real, given 3 concurrent stream producers on page load) was
  silently dropped for that connection, and the client's own hash-linkage check correctly flagged
  the resulting discontinuity. Fixed by subscribing before reading the backlog and replaying
  everything through one dedupe+strict-sequential buffer. Verified via a two-tab concurrent-
  subscriber soak post-fix (36/36 blocks, `Verified Valid`, zero console errors in both tabs).
- **UI:** `src/components/AuditLedgerPanel.tsx` + `src/lib/auditStore.ts` — third panel alongside
  `Terminal`/`AppPreview` (`App.tsx` now a 3-column grid). Verification is client-side via Web
  Crypto (`crypto.subtle`), not a trusted server-reported flag.
- **Verification:** `tsc -b`/`build`/`test:sse` all clean; independent Node-based full-chain
  hash recomputation; rate-limit (429 + audit-logged), forbidden-operation, and clamping paths
  each exercised directly; retention worker proven with a manually-backdated file; real prod boot
  confirms the audit route still carries the full strict CSP (never needed sandbox-frame's
  exemption).
- **Risk/Debt:** in-memory chain/backlog are capped (2,000 / 100) — old on-disk history isn't
  re-served over the live stream; rate limiting is a single global window, not per-tenant; no
  committed regression test for the concurrency race specifically (manual soak only).
- **Next Milestone:** whatever the user scopes next.

### UOW-09 Sync — AgentZ Cookbook Presets, Spectator Mode & SDK Bible Consolidation — 2026-07-22
- **Architecture decision (architect-directed):** flagged that "one active builder session" had
  two readings — guard only prompted builds, or unify every pipeline execution server-wide
  (matching the SDK doc's literal wording but changing `SwarmCanvas`'s already-shipped behavior).
  Directed to build **full unification**: one shared execution loop, everything else spectates.
- **`sessionManager.ts`:** `claimSession()` (first caller = `'builder'`, rest = `'spectator'`),
  `broadcastFrame`/`subscribe` pub/sub (mirrors `auditLedger.ts`'s pattern), abort/end handling
  that releases the lock the instant the builder's own connection drops or the run completes.
- **`agentStream.ts` refactor:** the simulation moved into `runPipeline()`, broadcasting instead
  of writing to one HTTP stream; a shared `serveSessionStream()` serves both the primary
  `/api/agent/stream` (claims a role) and the new always-spectate `/api/agent/spectate`
  (`SwarmCanvas` now uses this — it can never win the builder race with no prompt attached,
  which would have silently broken `AppPreview`'s ACME Order boot demo from UOW-07).
- **Cookbook:** `cookbookPresets.ts` + `CookbookDropdown.tsx` (header, one-click launch + saved-
  run instant replay) + `sessionRoleStore.ts` (drives the `🟢 ACTIVE BUILDER` / `👀 SPECTATOR
  MODE` header badge). Third flagship scenario added: **B2B Lead Scoring Bot**.
- **Real bug found via verification, not assumed correct from the code:** session serialization
  first captured audit blocks by index-range right after Lead Dev generated code — checking the
  actual written file showed only 9 of 11 expected events; the run keeps going for another ~1s
  (Lead Dev's own DONE + the whole Reviewer stage). Worse, even moved to fire after full
  completion, index-range filtering can't distinguish this session's tail events from a *new*
  build's events landing moments later. Fixed by tagging every audit event with its owning
  `sessionId` and filtering on that instead of timing — verified the serialized record now
  contains exactly this session's 11 events, all correctly tagged.
- **Verification:** `tsc -b`/`build`/`test:sse` clean, including a new dedicated spectator-mode
  test (builder + 2 concurrent spectators mirror an identical `agent_step` sequence, lock
  releases correctly afterward — not stuck). Real prod boot unaffected. Playwright: two tabs
  opened near-simultaneously render the *identical* generated app (confirmed via the sandboxed
  iframe's own heading) rather than two independent generations; Terminal's `run` correctly
  reports spectating when a build's already active; instant replay confirmed to skip the ~2s
  pipeline re-animation (status stays `ready` throughout). Zero console errors throughout.
- **Risk/Debt:** `SwarmCanvas` doesn't auto-reconnect after a build ends; the aspirational
  layout diagram's Command Drawer / in-app Bible viewer weren't built (not in the numbered DoD,
  documented as an explicit trim in the SDK doc itself); `.codex/demos/` has no retention worker.
- **Next Milestone:** whatever the user scopes next.

### UOW-10 Sync — Command Center Drawer, Navigation Polish & AgentZ Bible Viewer — 2026-07-22
- **Command Center:** `CommandCenterDrawer.tsx` replaces the old inline Robert/Streaming/Grid
  header links with a `☰ Command Center` slide-out drawer (top-left, next to the brand mark) —
  four rich cards (icon, description, hover state) for NemZilla Studio ("Current"), Robert
  Nemzek, StreamZilla, GridZilla. Built as an always-mounted panel with a toggled
  `translate-x`/`-translate-x-full` class (not conditional `<Show>` mount) so the slide actually
  animates — a mount/unmount toggle can't transition, there's no element present partway through.
- **AgentZ Bible viewer:** `BibleModal.tsx` + a new hand-rolled `src/lib/markdown.ts` (headings,
  code fences, bold/inline-code/links, lists, GFM tables — not a new dependency, matching this
  project's consistent no-new-runtime-deps pattern) + `GET /api/bible`
  (`src/server/routes/bible.ts`), which reads `.codex/AGENTZ-STUDIO-SDK.md` fresh off disk per
  request rather than a build-time bundle — deliberate, since this doc has been rewritten in
  every one of the last four UOWs and a static import would show stale content in a running prod
  server until redeploy.
- **Header cleanup:** `EcosystemNav.tsx` restructured — brand + Command Center left, Bible /
  Cookbook / role badge right, per the DoD's stated order once Command Center's explicit
  top-left placement is accounted for. Responsive: icon-only below `sm`, `flex-wrap` safety net.
- **Real issue hunted down during verification, but not caused by this UOW's code:** first
  browser pass showed the page stuck in a reload loop (rate limiter tripping, Vite's HMR client
  log repeating). Traced via `framenavigated` logging to two stray leftover `tsx watch
  server.ts` processes from earlier in this session, each with its own file watcher reacting to
  this UOW's source edits and pushing conflicting HMR signals — exactly the `npm run dev &`
  wrapper-doesn't-forward-SIGTERM gotcha the project's own run-skill already documents. Verified
  each stray PID's cwd before killing anything (two *other*, unrelated legitimate Vite instances
  for different projects were also running on the machine and were left untouched). Reran the
  identical verification script unmodified afterward — passed cleanly, confirming the code itself
  was never the problem.
- **Verification:** `tsc -b`/`build`/`test:sse` clean; real prod boot serves `/api/bible`
  correctly; Playwright at 375px/768px/1500px confirmed zero horizontal overflow at every width,
  a genuine slide transition (drawer bounding box `x: 0` open → `x: -384` closed, not a CSS
  no-op), the Bible modal rendering real multi-section content and closing cleanly, zero console
  errors throughout.
- **Risk/Debt:** `markdown.ts` only covers the syntax this one doc actually uses (no nested
  lists/blockquotes/images); the doc's pre-existing `$\rightarrow$` LaTeX-style arrows render as
  literal text (not something this viewer should silently rewrite); no committed automated test
  for the drawer/modal UI (manual Playwright only, matching this project's existing pattern for
  UI-only components).
- **Add-on — Recipe archiving:** `SaveRecipeModal.tsx` + `src/lib/recipeStore.ts` add a
  `[ 💾 Save to Cookbook ]` action to `AppPreview.tsx`'s header once a build is `ready` —
  `localStorage` is the immediate source of truth for display, with a best-effort
  `POST /api/sessions/save-recipe` (`recipeSerializer.ts`, server-validates id/category/lengths)
  archiving to `.codex/demos/custom-[recipe-id].json`. `sessionSerializer.ts` now skips
  `custom-*.json` so "AgentZ Cookbook (saved runs)" and the new "⭐ My Saved Recipes" section in
  `CookbookDropdown.tsx` stay distinct.
- **Add-on — Diagram audit:** re-read `AGENTZ-STUDIO-SDK.md` fresh and confirmed all 5 requested
  diagrams present. Found and fixed two real pre-existing issues while auditing: a duplicated
  Dual-Engine Architecture diagram (two near-identical copies, dating to before UOW-06) and a
  stale section-8 claim that the Command Drawer/Bible buttons "are not built" — false as of this
  same UOW. Added section 13 documenting the new components.
- **Add-on verification:** `tsc -b`/`build`/`test:sse` clean; prod boot confirms
  `POST /api/sessions/save-recipe` returns 400 on bad input, 200 + correct file on valid input;
  Playwright confirmed the full save → localStorage + server file → dropdown → instant-replay
  flow end to end, zero console errors.
- **Next Milestone:** whatever the user scopes next.

### UOW-11 Sync — Conversational Swarm Engine & Pluggable Micro-Agents — 2026-07-22
- **Vision:** `.codex/specs/UOW-11-CONVERSATIONAL-SWARM-VISION.md` retargets the platform from a
  static scenario-launcher (prompt keyword-matched to a fixed template) to a conversational AI PO
  interview driving a pluggable domain-micro-agent swarm, with Audit/Notifier/Artifact-Recorder
  as passive event-bus daemons rather than pipeline-coupled calls. Draft breakdown appended to
  `context.md` as Phase 1 (artifact bundle + event bus), Phase 2 (PO interviewer + telemetry),
  Phase 3 (domain micro-agents + "Andiamo!" hand-off).
- **Task 11.1 — Session Bundle Recorder:** `src/server/services/sessionBundleRecorder.ts` writes/
  reads the 5-artifact bundle (`po-transcript.json`, `project-plan.md`, `catalog.json`,
  `policy-rules.json`, `app-payload.json`) under `.codex/sessions/[session-id]/`, one artifact at
  a time so a partial interview persists before a payload exists. `GET`/`PUT
  /api/sessions/:id/bundle` (`src/server/routes/sessionBundle.ts`) reuses the UUID-only
  `sessionId` guard from `sessionSerializer.ts`/`recipeSerializer.ts`. Verified live: full write→
  read round trip for all 5 artifacts, invalid shape / bad artifact key / path-traversal
  `sessionId` all correctly rejected (400).
- **Task 11.2 — Event Bus Refactor (architect-directed sequencing: bus before wiring the
  recorder into the live pipeline):** `src/server/services/eventBus.ts` — a minimal tagged
  pub/sub (`broadcast`/`audit`/`notify`/`data` tags, each owned by exactly one daemon). Four
  self-registering daemons (`broadcastRelay.ts`, `auditDaemon.ts`, `notifierDaemon.ts`,
  `artifactRecorderDaemon.ts`), imported once for side effects via `daemons.ts` -> `app.ts`.
  `agentStream.ts`'s `runPipeline()` and `agentStreamHandler()`, plus `spectatorStream.ts`, now
  emit one tagged `PipelineEvent` per occurrence instead of calling `broadcastFrame` /
  `enqueueAuditEvent` / `recordCompletedBuild` directly — those three call sites are now fully
  decoupled from the pipeline that produces the events. `artifactRecorderDaemon.ts` is the first
  real listener wired onto the new UOW-11 session bundle: it reacts to `pipeline_completed` and
  writes `app-payload.json` via `sessionBundleRecorder.ts` (Task 11.1's service), alongside the
  still-required legacy `recordCompletedBuild()` call the Cookbook dropdown reads from.
  `notifierDaemon.ts` is genuinely new behavior, not just a refactor — it turns `notify`-tagged
  events (generation refused, policy clamped, build complete) into a `notification` SSE frame;
  no client UI consumes it yet (that's Phase 2/3), but the daemon side of the wire is live.
- **Design decision:** the emit call sites (not the daemons) decide which tag(s) apply to a given
  occurrence — e.g. `token_stream` only carries `broadcast`, `agent_step` carries both `broadcast`
  and `audit`, `pipeline_completed` carries `data` and `notify` but no `broadcast`. This keeps
  every daemon a dumb, fully generic forwarder (`if (event.audit) enqueueAuditEvent(...)`) with
  zero per-event-name branching, so a future daemon is "check for a tag" rather than "know the
  full event vocabulary" — the reason a fifth daemon (or Phase 2's PO transcript listener) won't
  require touching `auditDaemon.ts`/`broadcastRelay.ts` at all.
- **Verification:** `npx tsc -b` clean, `npm run build` clean. `npm run test:sse` required one
  intentional update, not a regression fix: the prompted-stream test's SSE event allowlist didn't
  know about the new `notification` event type yet (real new behavior from `notifierDaemon.ts`,
  scoped to the prompted-stream allowlist since it's only reachable via a completed generation).
  All four suites green after that update (51-frame full pipeline, 206-frame prompted generation,
  spectator-mode mirroring, abort-leak checks). Live end-to-end run against the real dev server
  confirmed byte-for-byte unchanged audit ledger shape (11 blocks: 1 `stream_connected` + 8
  `agent_step` + 1 `policy_check` + 1 `generated_app_payload`, hash chain intact), the legacy
  `.codex/demos/[id].json` still populated, and the new `.codex/sessions/[id]/app-payload.json`
  now auto-populated by the Artifact Recorder daemon with zero pipeline code aware of its
  existence.
- **Risk/Debt:** `artifactRecorderDaemon.ts` only handles `pipeline_completed` today — Tasks
  11.3-11.5 will need to add `po_transcript_updated` / `catalog_extracted` /
  `policy_rules_compiled` listeners once the conversational interview actually produces that data;
  the daemon's existing settle-delay pattern (150ms, matching `auditLedger`'s non-blocking drain)
  should carry over unchanged. `notifierDaemon.ts`'s `notification` frame has no client
  consumer yet — Phase 2/3 UI work will need a `notificationStore.ts` + toast component to
  actually surface it.
### UOW-11 Task 11.3 Sync — Conversational AI PO Discovery Interviewer — 2026-07-22
- **Design:** `src/lib/poInterview.ts` — a deterministic finite-state machine (`vendor_name ->
  catalog -> policy_threshold -> complete`), matching this project's established pattern
  (`appGeneratorPrompt.ts`'s `matchScenario`/`generateAppSnippet`) of simulating "AI" behavior
  with real, inspectable logic rather than wiring a live model call. Invalid input at any stage
  re-asks the same question rather than crashing or silently advancing with bad data.
- **CLI integration:** rather than rewriting `terminalCommands.ts`'s existing command dispatcher
  (Zero Rewrites protocol), added a `build` command that starts the interview and a module-level
  `activeInterview` flag that reroutes every subsequent input line to the PO as a chat answer
  instead of a shell command — mirrors `sessionManager.ts`'s existing precedent of module-level
  mutable state for a single active flow, just client-side and per-tab instead of server-wide.
  `help`/`run`/`triad`/`metrics`/`launch`/`clear` are all untouched and still dispatch normally
  once the interview reaches `complete`.
- **Hand-off proof, not just extraction:** added an `andiamo` command that fetches the just-
  persisted session bundle back from the server (`GET /api/sessions/:id/bundle`, Task 11.1) and
  prints a vendor/catalog/HITL-threshold summary — a real, verifiable round trip rather than a
  command that merely echoes client-side state, so Task 11.4's swarm hand-off has something
  concrete to build on. Deliberately does **not** clamp the requested HITL threshold to the
  $500/$250 system ceiling here — that's Task 11.6's "enforcing user-defined policy bounds on
  checkout" per the roadmap, kept out of this task's scope.
- **`src/lib/sessionBundleClient.ts`:** thin `fetch()` wrapper around Task 11.1's bundle
  endpoints, matching the project's existing convention of plain `fetch()` (not `hc<AppType>`)
  for the whole `/api/sessions/*` family (see `recipeStore.ts`, `CookbookDropdown.tsx`) rather
  than fighting Hono RPC's dynamic-segment typing.
- **Real environment issue found and worked around, not caused by this task:** the shared
  `run-nemzilla-studio` skill's Playwright driver (`waitUntil: 'networkidle'`) timed out on page
  load — reproduced identically against the *unmodified* default scenario, ruling out a Task
  11.3 regression immediately. Root cause, found via `framenavigated` logging: Vite's dev-mode
  HMR client was full-page-reloading the main frame in a tight loop in this container (dozens of
  reloads/second), wiping all Solid component state before any typed input could register —
  unrelated to the app's own code (no `location.reload()` anywhere in `src/`). Verified instead
  against a `NODE_ENV=production` boot (no Vite middleware at all, so no HMR client): the full
  conversational flow ran clean end to end via a throwaway Playwright script (scratchpad-only,
  matching the UOW-03 precedent, deleted after use) — zero console errors, and the persisted
  `po-transcript.json` (8 correctly-ordered/timestamped entries), `catalog.json` (3 items, exact
  prices), and `policy-rules.json` ($100 HITL/auto-approve, $500 auto-deny) all verified
  byte-correct on disk afterward.
- **Verification:** `npx tsc -b`/`npm run build` clean; `npm run test:sse` clean (no server-side
  change this task, re-run only as a regression guard); production-mode Playwright run as above.
- **Risk/Debt:** the dev-mode HMR reload-storm issue is real and will block *any* future
  browser-driven verification against `npm run dev` in this container until root-caused further —
  flagging it here rather than silently routing every future check through production mode.
  `poInterview.ts`'s catalog/threshold parsing is deliberately permissive single-line grammar
  (`Name|$Price, ...` / a bare dollar amount), not natural-language extraction — consistent with
  every other "AI" step in this codebase being simulated-but-real rather than a live model call.
- **Next Milestone:** Task 11.4 — broadcast live Swarm Telemetry packets ([PO] -> [Architect] ->
  [Domain Micro-Agents] -> [Policy] -> [Lead Dev]) over `/api/agent/stream`.

### UOW-11 Task 11.4 Sync — Live Swarm Telemetry over `/api/agent/stream` — 2026-07-22
- **Architectural decision (additive, not a replacement):** the classic `runPipeline()`
  (Planner/Architect/Lead Dev/Reviewer) is load-bearing for a lot of already-shipped surface —
  `SwarmCanvas.tsx`'s hardcoded 4-node force layout, `AppPreview.tsx`'s ACME Order boot demo, the
  Cookbook presets, and `verify-agent-stream.ts`'s assertions. Rather than reshape it into the new
  5-stage swarm lineup (which would cascade into all of those), added a second, parallel stage-
  list runner — `runSwarmPipeline()` — selected by a new opt-in `?swarmSessionId=` query param on
  the *same* `/api/agent/stream` endpoint (mutually exclusive with `?prompt=`). Zero risk to
  anything already built; confirmed via an unmodified `npm run test:sse` re-run.
- **Stage list:** `[PO] -> [Architect] -> [Domain Micro-Agents] -> [Policy] -> [Lead Dev]`, per
  the vision doc's Phase B diagram. `[Domain Micro-Agents]` is deliberately a single placeholder
  stage — Task 11.5 owns the real pluggable dispatch (AI Vendor/AI OE/AI TODO/AI Sport/AI SS/
  AI Food) based on interview context, and doing that here would be scope creep. `[Lead Dev]` is
  reasoning-only telemetry, no `generated_app_payload` — real code synthesis needs 11.5's domain-
  agent output plus 11.6's Andiamo launch wiring, neither of which exists yet.
- **`[Policy]` is real, not simulated:** calls the existing `resolveOrderThreshold()` from
  `policyEngine.ts` against the interview's actual requested HITL threshold — same governance
  ceiling ($250 auto-approve / $500 auto-deny) the classic ACME scenario already enforces, just
  evaluated against conversational-interview data instead of a scenario template's default.
- **Data-connected telemetry, not generic copy:** `runSwarmPipeline()` reads the completed PO
  interview back via Task 11.1's `readSessionBundle(swarmSessionId)`, so every stage's reasoning
  text references the real vendor name, catalog size, and requested threshold — e.g. "Reviewing
  the discovery interview for Radio Shack — 3 catalog item(s), a $100 HITL threshold requested."
  A missing/incomplete bundle produces a clean error `system_alert` + audit-logged `denied`, not a
  crash; a malformed `swarmSessionId` is rejected with 400 before a session is even claimed.
- **Event bus payoff, not just reuse:** every occurrence in `runSwarmPipeline()` emits the exact
  same tagged `PipelineEvent` shape (`broadcast`/`audit`/`notify`) Task 11.2's `runPipeline()`
  already uses — so the broadcast relay, audit daemon, and notifier daemon all handle this brand
  new pipeline shape with *zero* code changes of their own. This is the concrete payoff of Task
  11.2's decoupling: adding a second producer required touching exactly one file (`agentStream.ts`),
  not four.
- **Scannable pacing (per the vision doc's own wording):** 650ms/stage + an explicit 350ms
  "Handing off from X to Y..." beat between stages, versus the classic pipeline's 150ms — tuned
  for a human actually watching the swarm during a conversational demo, not a fast simulated CI
  run.
- **Documented scope trim:** `SwarmCanvas.tsx`/`swarmStore.ts` still hardcode the classic 4-node
  Planner/Architect/Lead Dev/Reviewer layout and silently drop any `agent_step`/`token_stream` for
  an unrecognized agent name (`PIPELINE_ORDER.indexOf(agent) === -1` short-circuits). A swarm-mode
  run's telemetry is fully broadcast/audited but not yet visually rendered — out of this task's
  stated scope ("Update `/api/agent/stream`," a server-side broadcast concern, not canvas
  rendering), and a real rewrite given the component's fixed node count/anchor positions/link
  list. Flagged as risk/debt, not silently left undiscovered.
- **Verification:** `npx tsc -b`/`npm run build` clean; `npm run test:sse` clean (unmodified —
  regression guard for the classic pipeline). Live end-to-end runs against the real server:
  correct 10-event `agent_step` sequence in exact stage order, 6 hand-off `system_alert` messages
  referencing the real vendor name, a real (non-clamped) `policy_check` audit block at $100, a
  second run at $400 correctly clamped with a `notification` warning frame, 400 on a malformed
  `swarmSessionId`, and a graceful error alert (clean `session_ended`, no hang/crash) for a
  valid-shaped but nonexistent session.
- **Risk/Debt:** SwarmCanvas visualization gap noted above; `runSwarmPipeline()`'s `[Domain
  Micro-Agents]` stage does no actual work yet (single canned reasoning line) — Task 11.5 needs
  to replace it with real per-agent dispatch, likely turning this one stage into a variable-length
  sub-sequence rather than a single node, which will need its own telemetry-shape decision.
- **Next Milestone:** Task 11.5 — pluggable domain micro-agent handlers (AI Vendor, AI OE, AI TODO,
  AI Sport, AI SS, AI Food) dispatched dynamically based on PO discovery context.

### UOW-11 Task 11.5 Sync — Pluggable Domain Micro-Agent Dispatcher — 2026-07-22
- **Registry pattern, not a switch statement:** `src/server/services/domainAgents.ts` defines each
  of the 6 domain agents as an independent `{ agent, detect, run }` tuple in one array;
  `dispatchDomainAgents()` is a two-line filter+map over that array. This is the actual
  architectural property "pluggable" demands — a 7th agent (or a hundredth) is one new registry
  entry, and the dispatcher, `runSwarmPipeline()`, and every downstream daemon need zero changes.
- **Genuinely conditional, not theater:** `AI Vendor`/`AI OE` are unconditional (`detect: () =>
  true`) since every PO interview is fundamentally an order-entry app per the vision doc's own
  Scenario 1 framing — this matches the guidance's own example ("dispatching AI Vendor + AI OE for
  Radio Shack / OrderKong"). The other 4 use real deterministic keyword matching against the
  interview's vendor name and catalog item names (same style as `appGeneratorPrompt.ts`'s
  `matchScenario()` — simulated "AI" via inspectable logic, not a live model call). Proved this
  isn't hardcoded theater with two live runs: a plain retail catalog dispatched exactly 2 agents
  (`AI Vendor, AI OE`); a catalog engineered to hit every keyword category dispatched all 6, in
  registry order, with the correct hand-off narration through every stage.
- **Structured schema fragments, not just reasoning text:** each dispatched agent's `run()`
  returns `{ agent, summary, schema }` — `schema` is a real structured fragment (e.g. `AI Sport` ->
  `{ type: 'sportsWidget', source: 'ESPN', teams: [] }`), not just a sentence. These are embedded
  directly in each stage's `agent_step` audit payload, so the tamper-evident Merkle chain becomes
  the actual record of what each agent contributed — verified live by reading the `AI Sport` audit
  block back and confirming its `schema` field round-tripped exactly.
- **Refactor, not duplication, in `runSwarmPipeline()`:** the repeated EXECUTING -> tokens ->
  [stage-specific hook] -> metric_tick -> DONE beat (previously inline in Task 11.4's flat loop)
  is now `runSwarmStage()`, a single shared helper used by the two fixed pre-stages (PO,
  Architect), the variable-length domain-agent loop, and the two fixed post-stages (Policy, Lead
  Dev) — an `onTokensDone` hook lets Policy's real `resolveOrderThreshold()` call and its
  audit/notify emission slot into the exact same beat without a special-cased branch inside the
  loop body (which is what Task 11.4's version had). `swarmHandoff()` factors out the "Handing off
  from X to Y..." narration the same way.
- **Feeds Policy and Lead Dev for real, within this task's honest scope:** `Policy`'s audit payload
  and `Lead Dev`'s reasoning text both now include the full dispatched-agent list — literally
  "using outputs from AI Vendor, AI OE, AI TODO, AI Sport, AI SS, AI Food" in the mixed-keyword
  run. `Lead Dev` still doesn't synthesize real code from those schemas yet — that consumption
  step is Task 11.6's job (Andiamo launch), kept explicitly out of scope here rather than faked.
- **Verification:** `npx tsc -b`/`npm run build` clean; `npm run test:sse` clean (classic pipeline
  untouched, re-run as a regression guard only). Live end-to-end swarm runs as described above,
  covering both the "nothing extra dispatched" floor case and the "everything dispatched" ceiling
  case, plus direct audit-ledger inspection of a domain agent's schema fragment.
- **Risk/Debt:** keyword lists are hand-picked and English-only, consistent with every other
  "simulated AI" matcher in this codebase (`matchScenario()`, `poInterview.ts`'s parsers) — not
  natural-language intent classification. `AI Sport`/`AI SS`/`AI Food`/`AI TODO`'s schema
  fragments are structurally real but contentually empty (`teams: []`, `titles: []`, `recipes: []`,
  `tasks: []`) since the PO interview (Task 11.3) doesn't yet collect domain-specific details for
  them — only vendor/catalog/threshold. Populating those fragments with real extracted data would
  need the PO interview itself extended with domain-specific follow-up questions, which is outside
  this task's and this UOW's current numbered scope.
- **Next Milestone:** Task 11.6 — "Andiamo!" launch trigger: consume the dispatched agents'
  schemas to synthesize real code, pass it to `<AppPreview/>`, and enforce policy bounds at
  checkout.

### UOW-11 Task 11.6 Sync — "Andiamo!" Launch, Code Synthesis & Live HITL Gate — 2026-07-22
- **Code synthesis, not another template stub:** `src/server/services/swarmCodeSynthesizer.ts`'s
  `synthesizeOrderEntryApp()` generates a real, executable app from the aggregated bundle — same
  Dual-Engine shape as UOW-07's ACME template (catalog, cart, HITL modal, virtual notification
  drawer), but parameterized entirely by the PO interview's actual vendor name, catalog, and
  resolved policy ceiling. Since this is the first place *user-supplied* interview text gets
  embedded into a generated app's HTML/JS (every prior scenario's catalog was hardcoded), added
  real escaping: `escapeHtml()` for the vendor name in markup, `JSON.stringify` + `<`-neutralizing
  for the catalog embedded in the inline `<script>` (guards against both breaking the JS string
  literal and a `</script>`-style tag-injection attempt) — defense in depth on top of the existing
  iframe sandbox isolation, not a replacement for it.
- **A real cross-session-id bug caught and fixed before it shipped:** the Artifact Recorder
  daemon's existing `pipeline_completed` handler always wrote `app-payload.json` under
  `event.sessionId` — correct for the classic pipeline (one id, one purpose), but for a swarm run
  that id is the *ephemeral builder-lock id* (fresh per stream connection), not the *PO
  interview's own id* that `po-transcript.json`/`catalog.json`/`policy-rules.json` already live
  under. Emitting `pipeline_completed` unchanged would have split one build's artifacts across
  two disconnected `.codex/sessions/` folders. Fixed by adding an optional `bundleSessionId` field
  to the event's data payload — `writeAppPayload` uses `bundleSessionId ?? sessionId` (classic
  pipeline is unaffected, since it never sets the field), while `recordCompletedBuild`/
  `getSessionAuditBlocks` still correctly use the raw builder-lock `sessionId`, since that's the id
  every audit event from *this specific run* was actually tagged with. Verified directly: the
  swarm bundle folder ends up with all 4 artifacts together, while the legacy `.codex/demos/`
  record still correlates 16 audit blocks under its own distinct builder-lock id.
- **"Andiamo!" reuses the existing launch mechanism, doesn't reinvent it:** `sandboxStore.ts`'s
  `connectGenerator(prompt)` already opened `/api/agent/stream?prompt=...` and parsed
  `generated_app_payload` events into the preview — since the swarm pipeline emits the *exact same*
  event shape (a deliberate Task 11.4/11.6 design choice), the only new code needed was a thin
  `connectSwarmGenerator(swarmSessionId)` wrapper opening `?swarmSessionId=...` instead, sharing
  100% of the parsing logic via an extracted `connectToStream()` helper. `terminalCommands.ts`'s
  `andiamo` command calls this the same way `CookbookDropdown.tsx` already triggers builds via the
  shared singleton — inheriting the single-active-builder semantics for free (a build already
  active elsewhere makes `andiamo` a spectator of it, not a competing build).
- **Live policy enforcement, not a canned demo:** the synthesized app's checkout logic evaluates
  the interview's *actual* resolved HITL threshold (post-clamp, from the Policy stage) against the
  cart total — the same three-band logic (auto-approve / HITL / auto-deny) every other scenario
  uses, just driven by conversational data instead of a fixed number.
- **A real architectural boundary decision, not an oversight:** an order can be placed long after
  the swarm pipeline session that generated the app has already ended (the builder lock released,
  `sessionManager`'s backlog cleared). The generated app's own `postMessage` → `sandboxStore.ts` →
  `POST /api/orders/event` relay therefore calls `enqueueAuditEvent()` **directly**, not through
  `eventBus.ts`. Routing it through the bus's `notify`/`broadcast` tags would call
  `sessionManager.broadcastFrame()` well outside any active session — which unconditionally
  pushes onto the shared `backlog` array regardless of whether a build is active, so it would
  silently leak a stale frame into the *next*, completely unrelated build's initial seed data.
  `enqueueAuditEvent()` itself (the primitive the bus's own `auditDaemon.ts` calls) is the correct,
  narrower tool for an independent, post-session event like this one — documented explicitly in
  `orders.ts` so a future contributor doesn't "helpfully" route it through the bus for consistency.
- **Endpoint validation matches this project's established pattern:** `POST /api/orders/event`
  strictly validates (UUID `sessionId` via the same pattern as `sessionBundleRecorder.ts`, a
  bounded finite `total`, a whitelisted `decision` enum) before calling `enqueueAuditEvent` —
  same shape of defense as `recipeSerializer.ts`'s save-recipe validation.
- **Verification — the full UOW-11 story, live, not just unit-level:** curl-driven checks first
  (real vendor/catalog/ceilings/session-id embedded in the generated code; the bundle-folder split
  fix confirmed directly on disk; `/api/orders/event`'s validation and audit-mapping confirmed for
  both allowed and denied decisions). Then a **full production-mode Playwright run** (per Task
  11.3's established environment workaround for this container's dev-mode HMR reload storm): typed
  the entire interview into the real `nemzilla-cli` (`build` → vendor → catalog → threshold →
  `andiamo`), confirmed the swarm-generated app rendered live in `<AppPreview/>`'s iframe, clicked
  a real catalog item into the cart, submitted an order landing in the HITL band, watched the HITL
  modal appear, approved it, saw the shipped notification — then confirmed server-side afterward
  that `hitl_pending` and `hitl_approved` audit blocks were both recorded against the correct
  session, hash-chained correctly. Zero console errors throughout. One real test-only bug found and
  fixed along the way (not a product bug): the driver's scripted typing was fast enough to collide
  with `AppPreview.tsx`'s own boot-time `connectGenerator('ACME Order')` demo for the
  single-active-builder lock, briefly showing the ACME catalog instead of the swarm one — fixed by
  waiting for that boot demo to finish first, matching how a real human's much slower typing would
  never actually hit this race. `tsc -b`/`build`/`test:sse` all clean throughout.
- **Risk/Debt:** `Lead Dev`'s synthesized app is still a single fixed shape (order-entry with a
  catalog + cart + HITL gate) regardless of which domain agents were dispatched — `AI TODO`/
  `AI Sport`/`AI SS`/`AI Food`'s schema fragments are referenced in Lead Dev's reasoning text and
  recorded in the audit trail, but don't yet get their own rendered UI widgets in the generated
  app (that would mean the synthesizer branching per dispatched agent, not just per catalog/policy
  — a natural follow-on, not attempted here to keep this task's scope to what the guidance
  explicitly asked for: order placement + HITL + audit). The `andiamo` command doesn't warn the
  user if it ends up spectating an already-active build the way `run`/`triad` already do
  (`⚠ a build is already active...`) — a small, easy follow-up, not done here since it wasn't
  part of this task's stated scope.
- **UOW-11 complete.** All 6 tasks across Phase 1 (artifact bundle + event bus), Phase 2
  (conversational PO interviewer + swarm telemetry), and Phase 3 (pluggable domain agents +
  Andiamo launch with live policy enforcement) are shipped and verified end to end, live, in a
  real browser.
- **Next Milestone:** whatever the user scopes next.

---

# Architect Journal Entry: NemZilla Studio & Agent Swarm Pipeline

**Date:** July 21–22, 2026

**Module / Area:** NemZilla Studio Domain Setup, CLI Swarm Visualization, & Multi-Agent Architecture

---

## 1. Executive Summary & Core Objective

The primary goal of this iteration was twofold:

1. Establish a live, production-grade deployment for **NemZilla Studio** on Railway with custom domain routing via IONOS.
2. Showcase an interactive **Multi-Agent Development Pipeline (Swarm CLI)** demonstrating how a orchestrated agent workflow (Planner $\rightarrow$ Architect $\rightarrow$ Lead Dev $\rightarrow$ Reviewer) accelerates software delivery by up to **5x** through streamed execution.

---

## 2. Infrastructure & Custom Domain Configuration

* **Hosting Platform:** Railway (Service: `nemzilla-studio`)
* **Domain Registrar & DNS:** IONOS (`nemzilla.net` / `www.nemzilla.net`)
* **Target Port:** `8080`
* **Routing Strategy:**
* **Apex Domain (`nemzilla.net`):** Handled via IONOS native domain forwarding $\rightarrow$ redirected directly to `[https://www.nemzilla.net](https://www.nemzilla.net)`. (Eliminated root-level CNAME/TXT conflicts on Railway).
* **Subdomain (`www.nemzilla.net`):** Bound to Railway service target `7dynp1ew.up.railway.app` via CNAME.
* **Verification:** Added `_railway-verify.www` TXT record in IONOS (`railway-verify=1fcde467e31a8a74901060297...`) to validate domain ownership and issue SSL certificates.



---

## 3. Agent Swarm Architecture & CLI Demonstration

* **Execution Flow:**

$$\text{Planner} \longrightarrow \text{Architect} \longrightarrow \text{Lead Dev} \longrightarrow \text{Reviewer}$$


* **Streaming Protocol:** Real-time Server-Sent Events (SSE) streaming latency, memory footprint, and step completion to both the CLI simulator and the web UI node graph.
* **Performance Observation:**
* Total pipeline run executed in **`2078ms`** across all four agent nodes (averaging ~280ms–400ms per agent step).
* *UI Takeaway:* Because execution speed was ultra-fast, node transition states (`EXECUTING`) flashed past too quickly for visual UI indicators to hold state.



---

## 4. Key Lessons & Architectural Improvements

1. **Pacing & Visualization Control:**
* Rapid SSE streams require either network throttling, artificial delay hooks (`delay(1500ms)` per step), or a UI step-gating toggle to make the visualization interactive and clear for observers/demos.


2. **Foundations for "Agent Trust Control Plane":**
* *Concept:* Extend the agent workflow engine beyond execution into **policy enforcement** and **human-in-the-loop (HITL)** gates.
* *Core Pattern:* Introduce rule-based interceptors on agent transactions (e.g., policy checks based on cost thresholds, action risk levels, or manual approval flags blocking execution until approved via email/dashboard).



---

## 5. Next Steps

* [ ] Commit `architect-journal.md` updates.
* [ ] Spin up a fresh chat session to brainstorm the conceptual architecture for the **Agent Trust Control Plane** (policy engines, MITM approval hooks, workflow definitions).

---

Copy and paste that straight into your journal! Whenever you're ready, open up a new chat, drop in your starting prompt, and let's level up this workflow engine concept! 🚀

---
