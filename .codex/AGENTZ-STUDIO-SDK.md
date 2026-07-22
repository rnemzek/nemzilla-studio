# AgentZ Studio SDK & Sandbox Architecture Specification

## Module / Layer,Key Features Built & Shipped
- 🛡️ Sandboxed Runtime,CSP-isolated dynamic iframe container (<AppPreview/>) rendering token-by-token code streams.
- ⚡ Multi-Agent Swarm,Planner -> Architect -> LeadDev -> Reviewer live token execution telemetry on <SwarmCanvas/>.
- 🌐 Dual-Engine Micro-Apps,"Engine A (Synthetic state, rules, HITL approvals) & Engine B (Live Action Kit: MLB, Weather, Meals)."
- ⚖️ Governance Policy Engine,"System ceilings ($500 cap, 20 API calls/min) + customizable user auto-approve thresholds ($250)."
- 🔐 Cryptographic Audit Ledger,"Non-blocking ring-buffer, SHA-256 Merkle Hash Chain verified on client via Web Crypto API."
- 👀 Concurrency & Spectator Mode,Single-active builder lock on Railway container resources + live read-only SSE spectator streaming.
- 📖 AgentZ SDK Bible Modal,Interactive inline Markdown reader serving .codex/AGENTZ-STUDIO-SDK.md live off disk with all ASCII diagrams.
- 💾 Preset Cookbook & Archiving,Flagship preset scenarios + custom user recipe modal saving to localStorage & .codex/demos/.
- ☰ Command Center Drawer,Unified slide-out navigation header with rich micro-app feature cards and responsive layouts.

## 1. Executive Summary & Vision
The **AgentZ Studio Sandbox** is a living, interactive demonstration of autonomous software creation, real-time API orchestration, and policy-driven governance. 

Unlike static code visualizers, AgentZ Studio enables users to prompt, build, test, and execute **stateful, single-file sandboxed micro-applications** directly inside an isolated browser runtime (`<AppPreview />`).

---

## 2. The Core Building Blocks (The "Frankenstein" Architecture)

Every generated micro-app inside the AgentZ Sandbox is built upon three unified pillars:

### A. The Synthetic State & Local Storage Engine
- **Concept:** Eliminates the need for external databases or servers.
- **Execution:** Micro-apps maintain in-memory JavaScript reactive state or `LocalStorage` arrays (e.g., product catalogs, active orders, user task lists).

### B. The Policy & Governance Interceptor
- **Concept:** Embedded "guardrails on AI actions" and business-rule evaluators.
- **Execution:** Evaluates custom conditions (e.g., `if (order.total <= 100) autoApprove(); else requireHITL();`). High-risk actions trigger Human-in-the-Loop (HITL) approval modals or supervisor queues.

### C. The Dual Event Bus (Live Web APIs + Virtual Notifications)
- **Live Action Kit:** Direct `fetch()` calls to public, zero-auth CORS APIs (MLB Stats, TheMealDB, Open-Meteo, Trending Movies).
- **Virtual Notification Center:** Simulated email, SMS, and push notification drawers rendered inside the micro-app UI to give full lifecycle feedback without spam risk.

---

## 3. Flagship Showcase Scenarios

### Scenario 1: ACME Order Entry & Approval System (Synthetic / Policy Focus)
- **Entities:** Product Catalog (TNT, Blowup Doll, Fake Tunnel) + Active Orders.
- **Rules Engine:** 
  - `Total <= $100` $\rightarrow$ Auto-Approved
  - `$100 < Total <= $500` $\rightarrow$ Requires Supervisor HITL Approval
  - `Total > $500` $\rightarrow$ Auto-Denied
- **Lifecycle Events:** Order Created $\rightarrow$ Supervisor Alert $\rightarrow$ Approved $\rightarrow$ Virtual Email Sent ("Order Shipped with Tracking #ACME-99").

### Scenario 2: "My TODAY Itinerary" (Hybrid API + Rules Focus)
- **Live Data Fetching:** Orioles game schedule (MLB API), Dinner Recipe (TheMealDB), Trending Movie (Watchmode/TMDB API).
- **Rule/Task Engine:** Interactive checklist for weekend errands (Lowe's mulch, Jiffy Lube inspection).
- **Virtual Bus Alerts:** Timed notifications ("5:00 PM: Get groceries for Chicken Salad", "7:30 PM: Orioles vs. Yankees starting on YouTubeTV").

### Scenario 3: B2B Lead Scoring Bot (Synthetic / Policy Focus)
- **Entities:** A lead-intake form (company size, monthly budget, urgency) + a running list of
  scored leads.
- **Rules Engine:** Weighted score = `sizeWeight(size) + min(budget / 100, 30) + urgencyWeight(urgency)`.
  - `Score >= 80` → **Hot Lead** — triggers a simulated outbound webhook alert.
  - `40 <= Score < 80` → **Warm Lead**.
  - `Score < 40` → **Cold Lead**.
- **Lifecycle Events:** Lead Scored → (if Hot) Simulated Webhook POST logged to a "Webhook Alert
  Log" panel (`POST https://hooks.crm.example/lead-alert -> 200 OK`).
- Implemented in `appGeneratorPrompt.ts`'s `B2B_LEAD_SCORING_SNIPPET`; matched via a prompt
  containing "lead", "b2b", or "scoring" (see `matchScenario()`).

---

## 4. Multi-User & Concurrency Strategy
- **Single-Active Sandbox + Spectator Mode:** To prevent Railway container resource exhaustion, the live server maintains **one active builder session** at a time.
- **Spectator Mode:** Secondary visitors connecting to `nemzilla.net` enter read-only Spectator Mode, watching active builds stream live in real time.
- **Preset Gallery:** Completed runs are serialized to `.codex/demos/[session-id].json` and accessible via an "AgentZ Cookbook" dropdown menu.
- **Implementation (UOW-09):** This is not just a policy statement — it's a literal server-wide
  execution lock. See section 11 (Single-Active Builder & Spectator Lock Flow) for the full
  mechanics of `src/server/services/sessionManager.ts`.

---

## 5. Security & Isolation Boundary
- **Preview Isolation:** Served via a dedicated, same-origin route (`/sandbox-frame`) with an isolated Content Security Policy (CSP) allowing Tailwind CDN and inline scripts, while protecting the main application's hardened production CSP.
- **Sandbox Attributes:** Embedded with `sandbox="allow-scripts"` (omitting `allow-same-origin`) to prevent generated payloads from accessing host site cookies or parent storage.

---

### Architectural Diagram: The AgentZ Dual-Engine App

```
┌─────────────────────────────────────────────────────────────┐
│                 The AgentZ Dual-Engine App                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [ Engine A: Synthetic / State & Policy ]                   │
│  • In-Memory Data / Catalog (ACME Orders, Products)        │
│  • Rule Interceptor (<= $100 Auto-Approve, > $500 Deny)     │
│  • Virtual Notification Drawer (Simulated Email / SMS)      │
│                                                             │
│  [ Engine B: Live Web / Action Kit ]                        │
│  • Direct CORS-Friendly Fetching (MLB GUMBO, TheMealDB, etc)│
│  • On-the-Fly Dynamic HTTP Parsing (Public JSON Endpoints)  │
│  • Real-Time Data Binding into the Generated UI             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. The Governance Policy Engine
Implemented in `src/server/services/policyEngine.ts`. Every platform action the agent
pipeline takes is bounded by two layers:

### A. System Ceiling (Platform Rules — hard, non-negotiable)
- **Max API calls:** 20 requests/min to `/api/agent/stream` (a global sliding window —
  matches the Multi-User & Concurrency Strategy's single-active-session model above; not
  per-IP). Exceeding it returns `429` and is audit-logged as a `denied` policy check.
- **Max Order Threshold:** `$500` — the absolute ceiling above which a generated app's
  order-approval flow must auto-deny, no matter what a user requests.
- **Forbidden Operations:** `delete_all_orders`, `disable_policy_engine`, `bypass_hitl` — a
  generation prompt naming one of these is refused outright (no snippet generated), and the
  refusal is audit-logged as `denied`.

### B. User-Defined Policy Bounds (customizable, clamped to the ceiling)
- A generation prompt may request its own auto-approve threshold for the ACME Order
  scenario (e.g. a prompt containing a number, `"ACME Order 750"`). `resolveOrderThreshold()`
  honors any request at or under a **$250 auto-approve ceiling** as-is, and **clamps**
  anything above it back down to $250 — the clamp decision itself is audit-logged
  (`policyStatus: "clamped"`) so the platform's own governance is part of the tamper-evident
  trail, not just the apps it generates.
- The $250 auto-approve ceiling is deliberately **lower** than the $500 order-value ceiling,
  not equal to it — clamping the auto-approve tier to the same value as the deny boundary
  would collapse the HITL band to nothing (e.g. "between $500 and $500"). The two ceilings
  are tracked separately in `SYSTEM_CEILING` for exactly this reason.

---

## 7. The Asynchronous Cryptographic Audit Ledger
Implemented in `src/server/services/auditLedger.ts`. Every policy check, agent execution
step, stream connection ("API call"), and generation event is appended to a tamper-evident
log:

### A. Non-Blocking In-Memory Audit Queue
- `enqueueAuditEvent()` pushes `{ action, payload, policyStatus }` onto an in-memory ring
  buffer (capacity 200) and returns immediately — callers on the request-handling path never
  block on hashing or disk I/O.
- A background worker (`setImmediate`-scheduled, not a real OS thread) drains the queue
  asynchronously: computes the next hash, appends the resulting block to the in-memory
  chain (capped at the most recent 2,000 blocks to bound memory — see Task 8.3's Risk/Debt),
  persists it to disk, and broadcasts it to live SSE subscribers.

### B. SHA-256 Merkle Hash-Chain
Each block's hash is derived from the previous block's hash, so any historical edit changes
every hash after it — the tamper-evidence property:

```
Hash_N = SHA256(Hash_(N-1) + Timestamp + ActionPayload)
```

The genesis block (`index: 0`) uses `Hash_-1 = "0".repeat(64)`. Verification is performed
**client-side** in `AuditLedgerPanel.tsx` using the browser's native Web Crypto API
(`crypto.subtle.digest`), independently recomputing each hash from the streamed
`{ prevHash, timestamp, payload }` rather than trusting a server-reported status — the badge
reads `Verified Valid` only if every recomputed hash matches what was streamed.

### C. 72-Hour Log Retention Policy
- Processed blocks are persisted as JSON lines to `.codex/audits/audit-YYYY-MM-DD.jsonl`.
- A retention worker sweeps `.codex/audits/` on server start and every 30 minutes
  thereafter, deleting any file whose mtime is older than 72 hours. This prunes the durable
  log files only — it does not affect the in-memory chain shown in a running session.

### D. Live Streaming
- `GET /api/audit/stream` (Hono `streamSSE`, same abort-safety pattern as
  `/api/agent/stream`) sends the most recent backlog of blocks on connect, then streams each
  new block as an `audit_block` SSE event as the background worker produces it.

---

## 8. Top-Level NemZilla Studio Platform Layout

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ NemZilla Studio Header                                                                  │
│ [ ☰ Command Drawer ]  [ 📖 AgentZ Bible ]  [ Preset Cookbook ▾ ]        🟢 ACTIVE BUILDER │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
┌────────────────────────────────────────┐   ┌────────────────────────────────┐
│ Agent Workflow & Swarm Canvas          │   │ Multi-Tab Sandboxed Runtime    │
│ • Lead Architect / Dev Node Reasoning  │   ├────────────────────────────────┤
│ • Token-by-Token App Code Stream       │   │ [ App Preview ]                │
│ • Live Execution Telemetry             │   │ [ Source Code ]                │
└────────────────────────────────────────┘   │ [ 🛡️ Cryptographic Audit ]     │
                                              └────────────────────────────────┘
```

**Current implementation status** (as of UOW-10 — see uow-09.md/uow-10.md for the history):
- **Header:** `EcosystemNav.tsx` — brand mark + `CommandCenterDrawer.tsx` (`☰ Command Center`,
  top-left) on one side; `BibleModal.tsx` (`📖 AgentZ Bible`), `CookbookDropdown.tsx`
  (`Preset Cookbook ▾`), and the role badge (`🟢 ACTIVE BUILDER` / `👀 SPECTATOR MODE`, via
  `sessionRoleStore.ts`) on the other. The old inline Robert/Streaming/Grid links were replaced
  by the Command Center drawer's rich cards in UOW-10 — the diagram above is now fully built,
  not aspirational.
- **Agent Workflow & Swarm Canvas:** `SwarmCanvas.tsx`, spectating (`/api/agent/spectate`) the
  single active build server-wide rather than running its own.
- **Multi-Tab Sandboxed Runtime:** `AppPreview.tsx` — the `[ App Preview ]` / `[ Source Code ]`
  tabs from UOW-06, a `[ 💾 Save to Cookbook ]` action in the header bar once a build completes
  (see section 12), plus a **third panel** (not a third internal tab) for the Cryptographic
  Audit Ledger — `AuditLedgerPanel.tsx`, mounted alongside `Terminal`/`AppPreview` in `App.tsx`'s
  3-column grid, not nested inside `AppPreview`'s own tab bar.

---

## 9. Governance & System Ceilings Matrix

| Concern | System Ceiling (hard) | User-Defined Bound | Enforcement |
|---|---|---|---|
| API call rate | 20 requests/min (global) | — not user-customizable | `checkRateLimit()` → `429` + audit `denied` |
| Order auto-deny boundary | $500 | — not user-customizable | Fixed `SYSTEM_CEILING.maxOrderThreshold`, embedded in every ACME snippet |
| Order auto-approve threshold | $250 (`maxAutoApproveThreshold`) | Any value ≤ $250 honored as-is | `resolveOrderThreshold()` clamps requests > $250 down to $250; clamp is audit-logged `clamped` |
| Forbidden operations | `delete_all_orders`, `disable_policy_engine`, `bypass_hitl` | — cannot be overridden | `checkForbiddenOperation()` refuses generation outright; audit-logged `denied` |
| Concurrent builds | 1 (server-wide) | — cannot be overridden | `sessionManager.claimSession()` — see section 11 |
| Audit log retention | 72 hours (on-disk files) | — not user-customizable | `pruneOldLogs()` sweep, startup + every 30 min |

The auto-approve ceiling ($250) is deliberately **lower** than the auto-deny boundary ($500), not
equal to it — see section 6B for why collapsing them produces a degenerate HITL band.

---

## 10. Cryptographic Merkle Hash Chain Flow

```
 enqueueAuditEvent(action, payload, policyStatus, sessionId)
        │  (non-blocking: push to in-memory ring buffer, return immediately)
        ▼
 ┌─────────────────┐   setImmediate    ┌──────────────────────────────────┐
 │  pending queue   │ ────────────────▶ │        drainQueue() worker        │
 │  (cap: 200)      │                   │  prevHash = chain.at(-1).hash     │
 └─────────────────┘                   │        (or GENESIS_HASH if empty) │
                                        │  hash = SHA256(prevHash           │
                                        │              + timestamp          │
                                        │              + JSON(payload))     │
                                        └───────────────┬───────────────────┘
                                                         ▼
                              ┌──────────────────────────────────────────┐
                              │  block = { index, timestamp, action,      │
                              │    payload, policyStatus, prevHash, hash, │
                              │    sessionId }                            │
                              └───────┬───────────────────┬───────────────┘
                                      ▼                   ▼
                     chain.push(block)          persist to .codex/audits/
                     (cap: 2,000 in memory)      audit-YYYY-MM-DD.jsonl
                                      │
                                      ▼
                     broadcast to subscribers → GET /api/audit/stream
                                      │
                                      ▼
                 AuditLedgerPanel.tsx: crypto.subtle.digest() independently
                 recomputes SHA256(prevHash + timestamp + JSON(payload)) for
                 every streamed block and compares to the reported hash —
                 "Verified Valid" only if every recomputation matches AND
                 each block's prevHash matches the previous block's hash.
```

---

## 11. Single-Active Builder & Spectator Lock Flow

```
                        GET /api/agent/stream  or  GET /api/agent/spectate
                                          │
                                          ▼
                          sessionManager.claimSession()
                          (/spectate always returns 'spectator'
                           without calling claimSession() at all)
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼ no build active                            ▼ a build is already active
         role = 'builder'                                role = 'spectator'
         runPipeline(sessionId, prompt) starts,            subscribes to the SAME
         broadcasting every SSE frame via                   broadcastFrame() stream —
         sessionManager.broadcastFrame()                    never starts its own pipeline
                    │                                                    │
                    └─────────────────────┬──────────────────────────────┘
                                          ▼
                      EVERY connection (builder + all spectators) is
                      "just" a subscriber to the shared broadcast — the
                      only difference is which one is driving the pipeline.
                                          │
                                          ▼
                    pipeline runs to completion (or the builder's own
                    connection aborts, via requestAbort(sessionId))
                                          │
                                          ▼
                      endSession(sessionId) → broadcasts 'session_ended' →
                      every subscribed connection (builder + spectators)
                      relays it and closes its own SSE stream → lock released
                                          │
                                          ▼
                         next incoming connection can claim 'builder'
```

**Why SwarmCanvas connects to `/api/agent/spectate`, never `/api/agent/stream`:** if it used
`/api/agent/stream` with no prompt, it could win the builder race on a page load before
`AppPreview`'s prompted connection arrives, running an unprompted, generated_app_payload-less
build that `AppPreview` would then just spectate — silently breaking the "boots with the ACME
Order demo" behavior from UOW-07. `/api/agent/spectate` is a dedicated endpoint that *never*
calls `claimSession()`, so a pure-visualization consumer can never accidentally start a build.

---

## 12. AgentZ Cookbook & Session Replay

- **`src/lib/cookbookPresets.ts`:** the 3 flagship scenarios (id, label, description, and the
  `prompt` string sent to `/api/agent/stream`), rendered by `CookbookDropdown.tsx` in the header.
  Launching a preset calls `sandboxStore.connectGenerator(preset.prompt)` — if a build is already
  active, this becomes a spectator of it rather than a competing build, per section 11.
- **`src/server/services/sessionSerializer.ts`:** once a build completes (after "pipeline
  complete", not right after code generation — the pipeline keeps running through the Reviewer
  stage for another ~1s past that point), `recordCompletedBuild()` writes
  `.codex/demos/[session-id].json`: `{ sessionId, scenario, prompt, code, timestamp,
  auditBlocks }`. `auditBlocks` is filtered by `sessionId` (via `getSessionAuditBlocks()`), not by
  a timing-based index range — a later build's own audit events can start landing in the shared
  chain almost immediately after this one ends, and index-range filtering was found to leak them
  into the wrong session's record during verification (see uow-09.md).
- **Instant replay:** `CookbookDropdown.tsx` also lists saved runs (`GET /api/sessions`); picking
  one fetches the full record (`GET /api/sessions/:id`) and calls `sandboxStore.setCode(record.code)`
  directly — "instantly," per the DoD wording, means loading the saved app immediately rather
  than re-animating the ~2s simulated pipeline.
- **"Save to Cookbook" recipe archiving (UOW-10):** a `[ 💾 Save to Cookbook ]` button appears in
  `AppPreview.tsx`'s header once `sandboxStore.state.status === 'ready'`. `SaveRecipeModal.tsx`
  prompts for a Recipe Name, Description, and Category Tag (`Governance` / `Live Web Fetch` /
  `Custom Workflow`); `src/lib/recipeStore.ts` saves the result to `localStorage`
  (`nemzilla-studio:recipes`, the source of truth for the dropdown's instant-access display) and
  archives it server-side via `POST /api/sessions/save-recipe` → `.codex/demos/custom-[recipe-id].json`
  (`src/server/services/recipeSerializer.ts`). The `custom-` filename prefix keeps these separate
  from auto-serialized build runs in the same directory — `listSavedSessions()` explicitly skips
  it, so `CookbookDropdown.tsx` shows two distinct sections: "AgentZ Cookbook (saved runs)" (every
  completed build, auto-named by scenario) and "⭐ My Saved Recipes" (user-curated, named saves).
  Recipe archival is intentionally best-effort on the server side — the `localStorage` copy is
  saved first and is what actually drives the UI, so a failed archive POST is logged but non-fatal.

---

## 13. Command Center & AgentZ Bible Viewer (UOW-10)

- **`src/components/CommandCenterDrawer.tsx`:** a real slide-out panel (`translate-x-0` /
  `-translate-x-full`, always mounted so the transition can actually animate — a conditionally
  mounted panel has no element present partway through a slide) listing four ecosystem modules as
  rich cards (icon, description, hover state): NemZilla Studio (marked "Current"), Robert Nemzek,
  StreamZilla, GridZilla. Replaces the old inline header links entirely.
- **`src/components/BibleModal.tsx`** + **`src/lib/markdown.ts`:** renders this file live inside
  the app. `GET /api/bible` (`src/server/routes/bible.ts`) reads `.codex/AGENTZ-STUDIO-SDK.md`
  fresh off disk per request rather than a build-time bundle, since this doc keeps being rewritten
  UOW over UOW and a static import would go stale in a running production server until redeploy.
  `markdown.ts` is a small hand-rolled parser (headings, fenced code blocks, bold/inline-code/
  links, lists, GFM tables, hr) covering exactly the syntax this doc uses — not a general-purpose
  CommonMark implementation, and deliberately not a new dependency.
