# UOW-08 Developer Journal — AgentZ Governance Engine & Cryptographic Audit Ledger

## What was built
- **`.codex/AGENTZ-STUDIO-SDK.md`** — added sections 6 (Governance Policy Engine) and 7
  (Asynchronous Cryptographic Audit Ledger), written to match exactly what was implemented
  (including the mid-build fix described below), not aspirational numbers from the hand-off.
- **`src/server/services/policyEngine.ts`** — `SYSTEM_CEILING`: `maxApiCallsPerMinute: 20`,
  `maxOrderThreshold: 500` (absolute deny boundary), `maxAutoApproveThreshold: 250` (the
  user-customizable tier's ceiling — see the design fix below), `forbiddenOperations`.
  `checkRateLimit()` (global sliding window), `checkForbiddenOperation()`, `resolveOrderThreshold()`
  (clamps a requested auto-approve threshold to `maxAutoApproveThreshold`).
- **`src/server/services/auditLedger.ts`** — `enqueueAuditEvent()` (non-blocking: pushes to an
  in-memory ring buffer, capacity 200, and returns immediately), a `setImmediate`-scheduled
  `drainQueue()` background worker that computes `SHA256(prevHash + timestamp + JSON.stringify(payload))`
  per block, appends to an in-memory chain (capped at 2,000 blocks), persists each block as a
  JSON line to `.codex/audits/audit-YYYY-MM-DD.jsonl`, and broadcasts to subscribers. A retention
  sweep (`pruneOldLogs`, on startup + every 30 min via an `.unref()`'d interval so it never keeps
  the process alive) deletes any log file older than 72 hours. `auditStreamHandler` serves
  `GET /api/audit/stream`.
- **`agentStream.ts` integration** — `checkRateLimit()` gates every connection (429 + audit-logged
  denial if exceeded); `checkForbiddenOperation()` refuses generation prompts naming a forbidden
  op (audit-logged denial, pipeline still runs but skips generation, emits a `system_alert`
  explaining the refusal); every `agent_step` transition, the ACME scenario's `policy_check`
  (allowed/clamped), and the final `generated_app_payload` are all audit-logged.
- **`src/lib/auditStore.ts` + `src/components/AuditLedgerPanel.tsx`** — mounted as a third panel
  (`App.tsx` widened to a `grid-cols-1 lg:grid-cols-3` layout alongside `Terminal`/`AppPreview`).
  Verification is **client-side**, using the browser's native Web Crypto API
  (`crypto.subtle.digest`) to independently recompute every block's hash rather than trusting a
  server-reported flag — genuine tamper-evidence means not trusting the source's self-report.

## Design fix made before generation even ran once: the two ceilings can't be equal
Initially `resolveOrderThreshold()` clamped a requested auto-approve threshold to the *same*
`maxOrderThreshold` ($500) used as the absolute deny boundary. First live test (`ACME Order 750`)
immediately showed why that's wrong: clamping to exactly the deny boundary produces
"Supervisor HITL approval required — order between $500 and $500" in the generated app — a
degenerate, always-empty HITL tier, since anything ≤$500 auto-approves and only >$500 denies, no
gap left for human review at all. Fixed by splitting the two ceilings: `maxOrderThreshold` (500,
absolute deny boundary, untouched) and a separate, deliberately lower `maxAutoApproveThreshold`
(250) that the user-customizable tier clamps to instead — this guarantees a real $250–$500 HITL
band always exists regardless of what a user requests. Caught by actually generating the app and
reading its own copy, not by inspecting the policy engine's code in isolation.

## A real race condition found and fixed via browser verification
Server-side, the hash chain was — and always was — cryptographically perfect: an independent
Node script hitting `/api/audit/stream` directly and recomputing every hash from scratch found
zero mismatches across every run. But loading the actual page in a real browser reliably produced
a `Chain Broken` badge. Root cause was in `auditStreamHandler`, not in the hashing/chain logic
itself: the original handler read the backlog snapshot (`getChainBacklog()`), sent it, and only
*then* called `subscribe()` for live blocks. Between "snapshot taken" and "subscribed," any block
produced by concurrent activity — and the real page has three concurrent producers hitting
`/api/agent/stream` at once (`SwarmCanvas`'s plain connection, `AppPreview`'s prompted connection,
plus their agent-stream pipelines both driving audit events) — fell into an unobserved gap: not
in the snapshot (already taken), not caught by the subscriber (not yet registered). That client
would receive a contiguous-looking-but-actually-gapped sequence (e.g. indices …, 1, 3, 4, … with
2 silently missing), and its own hash-linkage check correctly flagged the resulting discontinuity
as broken — the client's suspicion was completely justified, it just wasn't tampering, it was a
transport gap.

Fixed by subscribing *before* reading the backlog, feeding both backlog and live blocks into one
buffer (deduped by `index` via a `Set`, kept sorted), and only ever sending blocks in strict
gap-free sequential order (waiting if the next expected index hasn't arrived yet). This closes
the race regardless of timing rather than trying to make the window narrower. Verified via a
two-tab soak test (two independent `/api/audit/stream` subscribers, both watching the same
concurrently-produced chain) — both tabs reported `Verified Valid` with 36 identically-verified
blocks, zero console errors.

## Verification
- `npx tsc -b` clean, `npm run build` clean, `npm run test:sse` clean (rate limiter set high
  enough — 20/min — that the existing suite's ~9 calls per run, plus this UOW's own, never trips
  it; confirmed by rerunning the suite after adding the limiter).
- Recomputed every persisted block's hash independently in plain Node (`crypto.createHash`)
  against a live server run — 41 blocks, zero mismatches, confirming the server-side chain
  algorithm itself was correct even before the streaming-race fix.
- Fired 25 rapid requests at a fresh server to confirm `checkRateLimit()` actually enforces the
  20/min ceiling (429s past the limit) and that each denial is audit-logged as `rate_limit_denied`.
- Confirmed `checkForbiddenOperation()` refuses a prompt containing "bypass hitl" — pipeline still
  runs, but emits a `system_alert` explaining the refusal and skips generation.
- Confirmed the clamping path end-to-end: prompt `"ACME Order 750"` → generated app shows
  "auto-approve ≤ $250 · HITL up to $500 · auto-deny above $500," and the audit log records a
  `policy_check` block with `policyStatus: "clamped"`.
- Retention worker: manually created a 4-day-old `.jsonl` file and a fresh one in `.codex/audits/`,
  booted the server, confirmed the old file was deleted and the fresh one kept.
- Real `NODE_ENV=production` boot: `GET /` and `GET /api/audit/stream` both still carry the full
  strict UOW-05 CSP unchanged (the audit route was never exempted — no iframe/embedding concerns
  here, unlike `/sandbox-frame`).
- Playwright: loaded the real page, confirmed the Audit Ledger panel reaches `Verified Valid`,
  screenshotted all three panels together; re-ran a two-tab concurrent-subscriber soak after the
  race fix (36/36 blocks verified in both tabs, zero console errors).

## Risk/Debt
- The in-memory chain is capped at 2,000 blocks and the SSE backlog at 100 — a client connecting
  long after startup only gets a recent window, not the full history back to genesis (the durable
  `.jsonl` files on disk do hold full history until the 72-hour retention sweep prunes them, but
  nothing currently re-serves older on-disk history over the live stream).
- Rate limiting is a single global sliding window (matches the SDK's stated single-active-session
  model, not per-IP/per-user) — fine for this demo's concurrency model, not multi-tenant-safe.
- `matchScenario`'s number-extraction for the auto-approve threshold (`/\d{2,5}/` anywhere in the
  prompt) is coarse — same class of limitation already noted for scenario matching in UOW-07.
- No automated test covers the audit-stream race-condition fix directly (verified via manual
  two-tab Playwright soak, not a committed regression test) — a future
  `verify-audit-stream.ts` (mirroring `verify-agent-stream.ts`) exercising concurrent producers +
  multiple subscribers would catch a regression here automatically instead of relying on that.
