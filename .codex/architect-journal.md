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

### UOW-12 Sync — Pass A: Conversational UX Polish, Telemetry Deck & Swarm Pipeline Feedback — 2026-07-23
- **Tracker gap flagged:** a prior session's LLM-driven PO/domain-agent refactor (that session's
  own "UOW-13") landed after UOW-11 but was never logged here — noted in `context.md` rather than
  silently backfilled, since this UOW didn't do that work and shouldn't claim its journal.
- **No more secret word:** the AI PO's completion line now says "Ready to build your app? Click
  'Build' below or type 'build'" instead of instructing users to type "andiamo". `terminalCommands.ts`
  gained a `LAUNCH_TRIGGER_PHRASES` set ("build it", "go", "looks good", ..., `andiamo` silently
  kept) checked *before* the command switch once the interview is done — ordering matters, or the
  bare word "build" would hit `case 'build'` and start a second interview instead of launching. New
  `interviewStore.ts` mirrors the plain-mutable interview object into a real Solid store so
  `Terminal.tsx` can render a reactive "Click Build" CTA button on the same code path.
- **Artifacts / Telemetry deck:** new `ArtifactsPanel.tsx`, added as `AppPreview.tsx`'s 3rd tab
  (Transcript / Prompt & Payload Inspector / Agent Trace / Run History) — extends the existing tab
  bar rather than adding a new panel. `auditStore.ts` gained a shared singleton so this and
  `AuditLedgerPanel.tsx` don't each open their own `/api/audit/stream` connection.
- **Swarm Canvas closed a real, previously-flagged gap:** `swarmStore.ts`/`SwarmCanvas.tsx` now
  render whichever agent sequence is actually running (classic 4-node, or the swarm's dynamic
  `PO`→`Architect`→domain agents→`Policy`→`Lead Dev`) instead of hardcoding the classic 4 and
  silently dropping anything else — the debt UOW-11 itself flagged. Curated micro-status badges,
  self-scaling node size, clean reset on `Planner`/`PO` EXECUTING.
- **Real bug found and fixed:** `/api/agent/spectate` closes per-build by design (asserted by
  `scripts/verify-agent-stream.ts`); `swarmStore.ts`'s one-shot `connect()` never reopened it, so
  the canvas silently froze after the very first build it ever observed. Fixed client-side with a
  reconnect loop rather than loosening the server's tested session-scoped-spectate contract.
- **Persistent Run Saving:** new `runHistoryStore.ts` (localStorage-only, distinct from
  `recipeStore.ts`'s server-archived code-only Cookbook saves) captures the full bundle —
  transcript, extracted schema, this run's own audit blocks, generated code — surfaced via Run
  History's Save/View/Load/delete actions.
- **Verification:** `tsc -b`/`build`/`test:sse` clean throughout (the spectate fix never touched
  server code, so the existing spectate-stream assertions still hold). Full live Playwright runs
  across three complete discovery interviews (bakery, hardware store, sports fan shop) covering
  every Pass A requirement end to end, zero console errors. One test-harness-only false alarm along
  the way (a `:has-text("View")` selector substring-matching "Preview") — not a product bug.
- **UOW-12 complete.** All 4 Pass A requirements shipped.

### UOW-13 Sync — Pass B: The Step-by-Step Replay Scrubber — 2026-07-23
- **Replay Mode Controller:** new `replayStore.ts` singleton (`run`/`steps`/`stepIndex`/`playing`/
  `speed`) — `ArtifactsPanel.tsx`'s Run History tab gained "▶ Replay Current Run" (live, no Save Run
  needed) and a per-row "▶ Replay", both setting the same global state `SwarmCanvas.tsx` reacts to.
  Moved `AGENT_TRACE_ACTIONS` onto `auditStore.ts` as a shared export so the Agent Trace tab and the
  replay step count always agree on what a "step" is.
- **Visual Packet Trajectory:** `swarmStore.ts`'s new `buildReplaySnapshot()` reuses the *exact*
  live reducer (`ensureAgent`/`RUN_START_AGENTS`) folded over a run's own audit blocks up to the
  scrubbed index — no second parallel state machine. `SwarmCanvas.tsx` pauses its live spectate
  connection while replaying, renders a Step X of Y scrubber (Back/Play·Pause/Forward, 1x/2x,
  Exit), and tweens a small amber dot between each hand-off's nodes via `requestAnimationFrame`
  (not SMIL `<animateMotion>` — sidesteps cross-browser restart quirks) with a pulsing ring on
  whichever node(s) are in focus.
- **Contextual Packet Inspector:** a panel shows the current step's action/timestamp/payload;
  hovering a different node looks up that agent's own most recent step at-or-before the scrubbed
  index instead.
- **Runtime Policy Interceptor Visual:** new `policyTrajectoryStore.ts` drives a 3-stage bar in
  `AppPreview.tsx` ("Cart Submitted" → "Policy Checked ($X · decision)" → "Audit Ledger Signed") off
  the same `SANDBOX_MESSAGE.order` postMessage already relayed to `/api/orders/event`. Also extended
  the classic ACME snippet (`appGeneratorPrompt.ts`) to post that same message — previously only a
  PO-interview swarm build could demonstrate this at all; now the default boot demo can too, via the
  classic pipeline's own builder-lock `sessionId` threaded through `generateAppSnippet()`.
- **Real bug found and fixed, not new here:** `SwarmCanvas.tsx`'s node glow used inline
  `style={{filter:...}}`, which production's CSP (`style-src 'self'`, no `unsafe-inline`) silently
  drops — the glow had never actually rendered in production, despite earlier UOWs claiming "zero
  console errors." Found via this UOW's own Playwright pass; fixed by moving to Tailwind
  `drop-shadow-[...]` arbitrary-value classes for both the pre-existing glow and the new packet dot.
- **Verification:** `tsc -b`/`build`/`test:sse` clean. Full production-mode Playwright pass:
  boot-demo order flow renders the 3-stage trajectory correctly; Replay Current Run's banner, the
  scrubber's every control, the packet dot landing precisely on hand-off steps (both endpoint nodes
  ringed) and persisting through non-hand-off steps until the matching DONE, hover-driven inspector
  updates, and Exit restoring live mode all confirmed — zero console errors after the CSP fix.
- **UOW-13 complete.** All 4 Pass B requirements shipped, plus the CSP/inline-style fix.

### UOW-14 Sync — Pass C: Visitor Identity, Feedback Loops & Admin Session/Usage Drawer — 2026-07-23
- **Visitor Identity:** new `visitorStore.ts` — a fun default persona + a SHA-256-hashed
  `visitorId` (userAgent + a random per-browser token), both in `localStorage`. `VisitorTag.tsx`
  renders the editable `Observer: [ Handle ] ✏️` tag in the header; a heartbeat (immediate + 30s,
  paused when the tab is hidden) keeps the server's "last seen" honest.
- **Feedback & Assessment Drawer:** `FeedbackModal.tsx` — comment form + "Would you hire/partner
  with me?" Yes/Needs-Work + optional advice, one combined submit. `feedbackStore.ts` persists as
  JSON lines (mirrors `auditLedger.ts`'s own pattern); `githubIssueClient.ts` optionally files it as
  a real GitHub Issue when `GITHUB_ISSUES_REPO`/`GITHUB_TOKEN` are configured — unset by default.
- **Admin Usage & Session Drawer:** `visitorTracker.ts` (in-memory, mirrors `sessionManager.ts`'s
  simplicity) correlates a visitor to milestones (`PO Interview`/`Swarm Executed`/`Feedback
  Submitted`) and every pipeline `sessionId` they've driven. `AdminDrawer.tsx` (right-side
  slide-out) — List view + Detail view (that visitor's feedback + the union of
  `getSessionAuditBlocks()` across their linked sessions). Reachable via the CLI's new `admin`/
  `sessions` commands or `Ctrl+Alt+A` — deliberately unlinked from any visible nav, matching this
  app's existing no-auth posture (every other `/api/*` read is already public). The PO interview
  route now audit-logs each turn in real time under the interview's own `sessionId`, so the Session
  Detail view's "every prompt typed, PO response" reuses the exact same query the swarm pipeline's
  telemetry already relies on — no second storage path. `auditTrace.ts` extracts a shared
  `formatAuditLine()` (out of `ArtifactsPanel.tsx`) so both views render every action identically.
- **High-Value Alert Webhook:** `webhookNotifier.ts` — a Discord/Slack-compatible JSON POST to an
  optional `WEBHOOK_URL`, fired on a real swarm build claim and on any "would you hire me"
  submission (either answer). Best-effort, unset by default.
- **Verification:** `tsc -b`/`build`/`test:sse` clean. Full production-mode Playwright pass —
  including real billed Anthropic calls for a live PO interview, consistent with this project's
  established verification practice — confirmed persona generation + edit + reload persistence,
  feedback submission, admin drawer open/close via CLI and keyboard shortcut, and a full interview →
  swarm build correctly landing both `PO Interview`/`Swarm Executed` badges and a chronologically
  merged Audit Trail (boot-demo + interview turns + swarm build) under one visitor.
- **Non-issue flagged, not fixed:** a page-reload test step surfaced a benign console message from
  `auditStore.ts`'s pre-existing `fetch()` (no page-unload handling) — unrelated to Pass C, only
  fires on an actual reload, logged in a page context already being torn down.
- **UOW-14 complete.** All 4 Pass C requirements shipped.

### UOW-15 Sync — Brand Avatar Contrast & Swarm Canvas Badge Positioning Fix — 2026-07-23
- **Contrast:** `RnAvatar.tsx` now uses a vibrant orange gradient + bold black text + a crisp black
  border, replacing the old flat-orange/white-text version. Static `public/rn-avatar.svg`/
  `favicon.svg` updated to match.
- **The real bug behind "badges clumping under Reviewer":** not a z-order/layout issue as first
  suspected — `RnAvatar.tsx` destructured its props (`const { size, ...rest } = props`), which
  silently breaks SolidJS reactivity (Solid components run once; destructuring reads a prop's value
  at that moment and never again). Every SwarmCanvas badge receives a reactive `x`/`y` that the force
  layout keeps animating, so each badge froze at wherever its node was the instant it first mounted —
  and since a newly-added agent always starts as the rightmost node in whatever `n`-node layout is
  current, and the rightmost anchor's `x` is constant across every `n`, every badge froze at
  approximately the same spot regardless of where its own node later settled. Fixed with `splitProps`
  (Solid's reactivity-preserving alternative to destructuring) — confirmed via raw SVG attribute
  dumps, not just screenshots, that badges now track their own node 1:1. Also moved badge rendering
  to a dedicated top-level `<For>` pass (after all nodes) with an exact trig-based edge offset and
  `pointer-events-none`, as defensive polish on top of the actual fix.
- **Verification:** `tsc -b`/`build`/`test:sse` clean; before/after coordinate inspection confirmed
  the fix, and screenshots show one correctly-positioned badge per node.
- **UOW-15 complete.**

### UOW-16 Sync — Pass D: AgentZ CLI Rebrand, Guided Onboarding & App Preview Polish — 2026-07-23
- **AgentZ CLI rebrand + AI-first routing:** `Terminal.tsx`'s header/greeting rebranded, and
  `terminalCommands.ts`'s routing model flipped — `/`-prefixed input is now the *only* way to invoke
  a command (`SLASH_COMMANDS`-driven: help/build/andiamo/replay/reset/run/triad/metrics/launch/
  admin/clear); every other line of free text goes straight to the AI PO, unconditionally, with no
  more "command not found" for a stray word and no more special-cased plain-text cancel/help/clear
  interception mid-interview.
- **Slash palette + multiline input:** `Terminal.tsx` shows a live-filtered command palette while
  typing a command name (Arrow/Enter/Tab/Escape), and its input is now an auto-growing `<textarea>`
  supporting `Shift+Enter` for real multi-line messages.
- **Guided onboarding + working window controls:** new `GuidedWorkflowBanner.tsx` (collapsible,
  persisted) explains the platform in one line plus a 1-2-3 step guide. The terminal's red/yellow/
  green header dots are real buttons now (reset/minimize/expand), not decorative.
- **App Preview polish:** fixed a real header-row overflow (narrow-column tab bar clipping the
  status badge — same `flex-wrap`/`shrink-0` fix pattern already used in `EcosystemNav.tsx`), and
  added per-item Remove + Clear Cart to both order-entry app templates (the ACME demo and the
  swarm-synthesized app) so visitors can freely test different totals against the policy
  interceptor.
- **Consequence fix:** updated the `run-nemzilla-studio` skill's driver/SKILL.md, since its bare
  smoke-test commands and `input[type="text"]` selector were both broken by the slash-command
  rework and the input's switch to a `<textarea>`.
- **Verification:** `tsc -b`/`build`/`test:sse` clean; full production-mode Playwright pass covering
  every Pass D behavior, one pre-existing/unrelated console message during a `page.reload()` step
  (already root-caused in UOW-15).
- **UOW-16 complete.** All 3 Pass D requirement areas shipped.

### UOW-17 Sync — Pass E Kickstart: Multi-Agent Swarm Catalog (templateRegistry.ts & Domain Switcher) — 2026-07-23
- **Template Registry:** new `src/config/templateRegistry.ts` (shared client/server, `actionKit.ts`-
  style tsconfig sharing) — a `DomainTemplate` registry of 3 domains: `order-entry` (maps to the
  existing `acme-order` scenario), `wfd` (What's For Dinner — no dedicated generator yet, honestly
  flagged), `itinerary` (maps to the existing `today-itinerary` scenario). `templateStore.ts` holds
  the active id as a plain signal.
- **`/template` slash command:** lists or switches the active domain, in the same palette every
  other slash command already uses.
- **Dynamic re-hydration without fake telemetry:** Swarm Canvas shows the active template's own
  persona nodes/colors as an idle preview, but a new `runGeneration` counter on `swarmStore.ts`
  hands control back to the real pipeline's real agent names the instant a genuine run starts —
  the template layer is a pre-run preview, never a stand-in for real execution. App Preview shows
  the active domain + an on-demand "Preview this domain" button where a real generator exists. The
  AI PO's system prompt now layers the active template's overlay onto the base discovery prompt,
  reframing vocabulary without forking the underlying extraction schema three ways.
- **Branding guardrails:** "AgentZ CLI" → "AgentZ", `$` → `>`/`✨`, remaining "terminal" mentions
  scrubbed project-wide.
- **Real bug found and fixed:** the slash palette's Enter key required a second press to actually
  submit a fully-typed command (it always re-completed the suggestion instead of submitting on an
  exact match) — fixed in `Terminal.tsx`.
- **Documentation note:** found and completed an incomplete, dangling draft stub already sitting in
  `AGENTZ-STUDIO-SDK.md` for this exact feature (inaccurately referenced `React.ComponentType` in
  this SolidJS project) rather than silently deleting or leaving it broken.
- **Verification:** `tsc --noEmit`/`tsc -b`/`build`/`test:sse` all clean. Full production-mode
  Playwright pass confirmed every directive end to end, including a real LLM turn under the `wfd`
  overlay producing genuinely dinner-flavored PO phrasing — not just wiring that compiles.
- **UOW-17 complete.** All 4 Pass E kickstart directives shipped, plus the palette bug fix.

### UOW-18 Sync — Plan C Kickstart: Unified Itinerary Synthesizer — 2026-07-24
- **Schema:** `src/types/itinerary.ts` — `UnifiedItineraryPayload`/`ItineraryTask` built to match the
  schema a separate, parallel "Plan C" planning session (apparently run in Gemini — an untracked
  rehydrate-context file appeared alongside it) had already written directly into
  `AGENTZ-STUDIO-SDK.md`, rather than inventing a divergent shape. Shared across the browser/server
  tsconfig boundary the established `actionKit.ts`/`templateRegistry.ts` way.
- **Synthesizer:** `appGeneratorPrompt.ts`'s `buildUnifiedItinerarySnippet()` replaces the old static
  itinerary snippet with a real function merging errands/recipe/entertainment into one app — top:
  errand checkboxes; middle: the Paula Deen Pecan Chicken Salad recipe card with a real 7-item
  ingredient checklist and a real search link (no specific URL was given, so a real search link beats
  guessing one); bottom: a live MLB-fetched matchup + synthetic streaming-provider list.
- **The interesting part — local persistence vs. the sandbox's own security model:** the literal ask
  (iframe JS writes checkbox state to its own `localStorage`) can't deliver "persists across
  refreshes" as stated, because the iframe's `sandbox="allow-scripts"` (no `allow-same-origin`, by
  design) gives it a fresh opaque origin every load — anything it wrote to its own storage is already
  gone next time. Implemented the equivalent of what was actually wanted via the same postMessage-
  relay pattern the order-decision flow already uses: child posts state to the parent, the parent's
  real, stable origin persists and relays it back on the next render. Verified end-to-end: check two
  boxes, relaunch the same preview, both come back checked.
- **A real bug `tsc --noEmit` alone would have missed:** a stray backtick inside a code comment
  prematurely closed the outer template literal it was embedded in. `tsc --noEmit` reported clean
  because the root tsconfig has an empty `files` array and does nothing on its own; `tsc -b` (what
  `npm run build` actually runs) caught it immediately. Both now get run for any verification claim.
- **Verification:** `tsc -b`/`build`/`test:sse` clean; full production-mode Playwright pass confirmed
  every section renders (including the live MLB fetch) and the persistence relay genuinely survives a
  full preview relaunch. Zero console errors.
- **UOW-18 complete.**

### UOW-19 Sync — Plan C UOW-3/4: Edge Publishing Engine & QR Code Modal — 2026-07-24
- **Detail update:** the Pecan Chicken Salad recipe link now points to the real Food.com page
  supplied directly, replacing the earlier search-link placeholder.
- **Persistent storage:** `publishedAppStore.ts` — file-backed JSON (`data/published_apps.json`,
  gitignored), not SQLite, matching this project's established no-new-runtime-deps norm for exactly
  this shape of need. Real readable slugs with real collision handling, verified live.
- **`POST /api/publish` / `GET /share/:slug`:** the public route needed its own CSP exemption
  (extended the existing `/sandbox-frame` carve-out in `securityHeaders.ts`) so the Tailwind CDN
  script isn't blocked by the site-wide strict policy — mirrors `sandboxFrame.ts`'s own pattern
  exactly.
- **Publish button + QR modal:** `PublishModal.tsx`, using a newly added `qrcode` package — a
  deliberate, scoped exception to the no-new-deps norm, since a hand-rolled QR encoder risks
  producing an unscannable code and the ask itself offered a library as an acceptable option.
  Rendered as a PNG data URI specifically so the Studio's own strict CSP needed zero relaxation.
- **The interesting design problem:** the published page is a real top-level page at a real origin —
  not the sandboxed iframe the Studio preview uses — so the itinerary snippet's persistence logic
  needed to work correctly in both contexts with the same generated code. Made `persistState()`/
  restore do both the parent-relay (UOW-18, works embedded) and a direct own-origin `localStorage`
  write (works standalone), each safely inert where it doesn't apply. Verified live: a real page
  reload of a published itinerary page correctly restored a checked box via direct localStorage.
- **Verification:** `tsc -b`/`test:sse` (as requested) and `build` all clean. Full production-mode
  Playwright pass confirmed the whole publish → QR → visit-standalone → check-a-box → reload →
  still-checked chain end to end, plus collision-avoided slugs across two publishes. One console
  message was a Playwright-only clipboard-permission limitation, not a real bug.
- **UOW-19 complete.**

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
