# AgentZ Studio SDK & Sandbox Architecture Specification

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

---

## 4. Multi-User & Concurrency Strategy
- **Single-Active Sandbox + Spectator Mode:** To prevent Railway container resource exhaustion, the live server maintains **one active builder session** at a time.
- **Spectator Mode:** Secondary visitors connecting to `nemzilla.net` enter read-only Spectator Mode, watching active builds stream live in real time.
- **Preset Gallery:** Completed runs are serialized to `.codex/demos/[session-id].json` and accessible via an "AgentZ Cookbook" dropdown menu.

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
│  [ Engine A: Synthetic / State ]                            │
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

