# UOW-14 Developer Journal — Pass C: Visitor Identity, Feedback Loops & Admin Session/Usage Drawer

## What was built

### 1. Editable Visitor Persona & Identity
`src/lib/visitorStore.ts` generates, on first visit, a fun default persona
(`{FirstName}-{Role}-{3-digit}`, e.g. `Sana-Scout-877`) and a lightweight `visitorId`. The client
can't see its own IP, so `visitorId` hashes `navigator.userAgent` plus a random per-browser token
(a stand-in "session token") via SHA-256/Web Crypto — the same primitive `auditStore.ts` already
uses for hash-chain verification — truncated to 16 hex chars. Both persist to `localStorage`.

`src/components/VisitorTag.tsx` renders `Observer: [ Handle ] ✏️` in `EcosystemNav.tsx`'s header;
clicking the pencil swaps the bracketed name for an inline input (Enter/blur commits, Escape
cancels). An immediate heartbeat plus a 30s periodic one (skipped while `document.visibilityState
=== 'hidden'`) posts to `POST /api/visitor/touch`, keeping the server's "last seen" honest for the
Admin Drawer's active-duration column without needing every single client action to separately ping.

### 2. Feedback & Assessment Drawer
`src/components/FeedbackModal.tsx` — a subtle "💬 Feedback & Review" header button opens a modal
with a comment/issue textarea and a "Would you hire/partner with me based on this build?"
Yes/Needs-Work toggle plus an optional advice field, one combined submit (not two separate forms —
the DoD's "modal includes... and..." reads as one form with two sections).

Server-side, `src/server/services/feedbackStore.ts` persists every submission as JSON lines under
`.codex/feedback/feedback-YYYY-MM-DD.jsonl` — the exact same shape as `auditLedger.ts`'s own
persistence pattern — plus a bounded in-memory list (cap 500) the Admin Drawer reads directly.

For "or generates a GitHub Issue": `src/server/services/githubIssueClient.ts` posts a real issue
via GitHub's REST API when `GITHUB_ISSUES_REPO` + `GITHUB_TOKEN` are set in `.env`. This is
deliberately opt-in and unset by default — a public demo visitor's feedback should never
automatically file against a real repository unless the operator has explicitly wired that up
(no credentials exist in this environment, so I never turned it on or tested the live GitHub call
myself; `isGithubIssuesConfigured()` gates it cleanly so the rest of the feature works identically
either way).

### 3. On-Demand Admin Usage & Session Drawer
This was the structurally hardest part, because "visitor session" isn't a concept that existed
anywhere in the codebase before this UOW — there's `sessionManager.ts`'s ephemeral builder-lock
`sessionId` (one per SSE connection) and the PO interview's own persistent `sessionId` (one per
discovery conversation), but nothing correlating either to *who* (which browser) drove them.

`src/server/services/visitorTracker.ts` is the new correlation layer — an in-memory registry
(mirrors `sessionManager.ts`'s own simplicity: no persistence, bounded via
`MAX_TRACKED_VISITORS`/oldest-eviction) keyed by `visitorId`, holding `firstSeen`/`lastSeen`, a
`Set<Milestone>` (`'PO Interview' | 'Swarm Executed' | 'Feedback Submitted'`), and a
`Set<sessionId>` of every pipeline session that visitor has driven.

The interesting design question was **how** to correlate a visitor to their actual audit trail
without reaching into ad-hoc payload shapes. Two threads had to be pulled:

- **Swarm builds:** `agentStreamHandler` (`agentStream.ts`) now reads optional `?visitorId=&handle=`
  query params (sent by `sandboxStore.ts`'s `connectGenerator`/`connectSwarmGenerator` via a new
  shared `visitorQuery()` helper) and, **only for the connection that actually claims the builder
  role** (never a spectator — a spectator watching someone else's build shouldn't have that build
  attributed to them), calls `touchVisitor()` + `linkPipelineSession(visitorId, sessionId)`. The
  `'Swarm Executed'` milestone is added specifically when `swarmSessionId` is present — the real
  PO-interview-driven build, matching the DoD's own example — not the classic boot-demo/Cookbook
  path (which still gets linked for audit-trail visibility, just without that specific badge).

- **PO interview turns:** these previously left *no* trace in the audit ledger at all — the
  transcript only got persisted to the session bundle once the interview reached `done`
  (`persistInterviewArtifacts` in `terminalCommands.ts`). That would have made "every prompt typed,
  PO response" impossible to show for an in-progress interview, and would have required a second,
  different read path (the session bundle file) alongside the swarm pipeline's audit-block query.
  Instead, I threaded the interview's own `sessionId` (plus `visitorId`/`handle` from
  `visitorStore.ts`) through `poInterview.ts`'s client → `poInterviewHandler` server route, which now
  calls `enqueueAuditEvent('po_interview_turn', {...}, 'allowed', sessionId)` on every turn — real
  time, not just at completion. This means the Session Detail view's audit trail is just
  `getSessionAuditBlocks(sessionId)` unioned across every linked session and sorted by the ledger's
  own global `index` — the exact same primitive `sessionSerializer.ts` already established for
  "correlate a completed build's own trail," now reused for a second, genuinely different kind of
  correlation (visitor → many sessions, rather than one session → its own blocks).

`GET /api/admin/sessions` (list) / `GET /api/admin/sessions/:visitorId` (detail — visitor metadata +
their feedback + the merged audit trail) power `src/components/AdminDrawer.tsx`, a right-side
slide-out mirroring `CommandCenterDrawer.tsx`'s exact animation pattern (`translate-x-full` ↔
`translate-x-0`, always mounted) just flipped to the opposite side so the two don't visually clash.

Reachability: `terminalCommands.ts` gained `admin`/`sessions` CLI commands (added to `COMMANDS` but
deliberately **not** documented in `HELP_TEXT` — same "hidden" precedent as `andiamo`'s original
secret-word status), plus a `Ctrl+Alt+A` keyboard shortcut registered inside `AdminDrawer.tsx`
itself. Neither the drawer's trigger nor the `/api/admin/*` routes have any real authentication —
this app has *no* auth system anywhere (every other `/api/*` read, e.g. `/api/sessions/:id`, is
already unauthenticated), so gating this behind mere discoverability is consistent with the existing
security posture rather than a new gap. Building real auth for one drawer in an otherwise fully
public demo would have been a much larger, unrequested change; I flagged this explicitly in
`admin.ts`'s own doc comment rather than silently shipping it as if it were secure.

One small refactor fell out of this naturally: `ArtifactsPanel.tsx` had a private `traceLine()`
formatter for its Agent Trace tab. Since the Admin Drawer's Session Detail view needed to render the
exact same kind of audit blocks (plus the new `po_interview_turn` action neither view had ever
needed to format before), I extracted it to `src/lib/auditTrace.ts`'s `formatAuditLine()` — both
views now render identically off one function instead of two copies silently drifting.

### 4. High-Value Alert Webhook
`src/server/services/webhookNotifier.ts` — `sendHighValueAlert(message, details)` POSTs to an
optional `WEBHOOK_URL`. Payload includes both `content` (Discord's field) and `text` (Slack's field)
in one JSON body rather than picking a single vendor, since both accept a plain POST with no other
credentials — Twilio and Pushover need materially different auth/request shapes (form-encoded,
account SIDs, user/app tokens), so supporting all four from the DoD's example list would have meant
either faking three of them or scope-creeping into a small integrations SDK; I implemented the one
genuinely zero-extra-credential option for real and documented the choice.

Fired from two call sites: `agentStreamHandler` (a visitor's connection actually claims the builder
role for a `swarmSessionId` build) and `feedback.ts`'s route handler (any "Would you hire/partner
with me?" submission — either answer, since submitting the assessment at all, not just a "Yes", is
the notable signal per the DoD's own phrasing "submits the ... feedback form"). Always best-effort:
unconfigured or failing silently logs and never blocks the request that triggered it, matching
`recipeSerializer.ts`'s established "best-effort" precedent.

## Verification
- `npx tsc -b` — clean.
- `npm run build` — clean.
- `npm run test:sse` — clean; no server streaming contract changes (the new query params on
  `/api/agent/stream` are additive and optional, and the new `poInterviewHandler` fields are also
  optional — an old client omitting them just isn't tracked, the interview/build still works).
- **Full production-mode Playwright verification** (`NODE_ENV=production`, this project's
  established workaround), via a purpose-built script:
  - A generated persona tag (`Sana-Scout-877`) rendered on first load; editing it to
    `TestObserver-VerifiedRun-777` and pressing Enter updated the header immediately, and **a full
    page reload** still showed the edited handle — confirming `localStorage` persistence actually
    works, not just the in-memory Solid store.
  - Submitting feedback (comment + "Yes" + advice) showed the "recorded" confirmation.
  - Typing `admin` in the CLI opened the drawer; it listed exactly one tracked visitor
    (`TestObserver-VerifiedRun-777`) with a `Feedback Submitted` badge and correctly showed the
    default boot demo's own audit trail (7 steps: stream_connected → Planner/Architect/Lead Dev →
    policy_check) — confirming the classic pipeline path gets linked for visibility without a false
    `Swarm Executed` badge. `Ctrl+Alt+A` correctly closed the drawer.
  - Running a full discovery interview through the real terminal (`build` → "Radio Shack" →
    "Mouse Pad|$5, Mouse|$15" → "$100" → `build it`) against the **real** Anthropic API (a key was
    already present in this environment's shell — consistent with this project's established
    practice of exercising real LLM calls during verification, e.g. UOW-13 Task 11.3) correctly
    completed and launched a real swarm build.
  - Reopening the drawer (via `sessions` this time — the second CLI trigger) showed the same visitor
    now with all three badges (`Feedback Submitted`, `PO Interview`, `Swarm Executed`) and 3 linked
    pipeline sessions; the detail view's Audit Trail (23 steps) showed a single, chronologically
    correct merged sequence — the original boot-demo blocks, four real `po_interview_turn` entries
    with the actual transcript text ("Radio Shack" → "Perfect! Radio Shack it is...", etc.), and the
    swarm build's own `agent_step`/`policy_check`/`generated_app_payload` blocks — all attributed to
    the one visitor, exactly as designed.

## Non-issue found, explicitly not fixed
The page-reload verification step surfaced one console message: `audit stream error TypeError:
network error`. Traced to `auditStore.ts`'s `connect()` — its `fetch()` to `/api/audit/stream` has
no page-unload handling, so an actual browser navigation/reload kills the in-flight connection and
the `catch` block's `console.error('audit stream error', err)` fires (the `controller.signal.aborted`
check only catches an *explicit* `.abort()` call, which nothing here makes on unload). This is
unrelated to any Pass C code — that file is untouched this UOW beyond an unrelated Pass A export
(`AGENT_TRACE_ACTIONS`) — and only manifests on a real page reload/navigation, a moment when the
log lands in a page context that's already being discarded. Flagging it here rather than patching an
unrelated file outside this UOW's requested scope.

## Cleanup
The verification run generated real `.codex/audits/`, `.codex/demos/`, `.codex/sessions/`, and
`.codex/feedback/` runtime artifacts plus a throwaway server on port 5305 — all deleted before
finalizing, along with the `verify-passc.tmp.mjs` script itself, same as the prior two passes.

## UOW-14 complete
All 4 Pass C requirements shipped: Editable Visitor Persona & Identity, Feedback & Assessment
Drawer, On-Demand Admin Usage & Session Drawer, High-Value Alert Webhook.
