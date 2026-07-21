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

