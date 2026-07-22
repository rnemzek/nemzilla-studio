# Master Unit of Work (UOW) Context Tracker — NemZilla Studio

## Critical Modification Rules
- NEVER rewrite this entire documentation file to update task states.
- Always perform an INPLACE-EDIT to change `[ ]` to `[x]`.

## Active UOW Status
- **Current UOW**: UOW-08 - AgentZ Governance Engine & Cryptographic Audit Ledger
- **Active Task**: UOW-08 complete — ready for next UOW

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

