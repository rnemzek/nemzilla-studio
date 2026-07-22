# UOW-09 Developer Journal — AgentZ Cookbook Presets, Spectator Mode & SDK Bible Consolidation

## Architectural decision, made explicit before writing code
The hand-off's session-lock requirement ("restrict simultaneous agent stream builds to one
active session") had two honest readings: guard only prompted generation requests (surgical,
leaves `SwarmCanvas`'s existing independent visualization connection untouched), or unify
*every* pipeline execution server-wide (matches the SDK doc's literal "one active builder
session at a time... secondary visitors enter read-only Spectator Mode," but changes
`SwarmCanvas`'s already-shipped behavior). Flagged this before implementing rather than guessing;
architect selected **full unification**, with explicit direction that SwarmCanvas, AppPreview,
Terminal, and secondary tabs should all be synchronized spectators/views of one shared execution
loop. Built exactly that.

## What was built
- **`src/server/services/sessionManager.ts`** — `claimSession()` (first caller becomes
  `'builder'`, everyone else `'spectator'`), `broadcastFrame`/`subscribe` (pub/sub, mirrors
  `auditLedger.ts`'s existing pattern), `requestAbort`/`isAborted` (lets the builder's own
  disconnect stop the shared run early), `endSession` (releases the lock, broadcasts
  `session_ended`).
- **`agentStream.ts` refactor** — the per-stage simulation moved into `runPipeline(sessionId,
  prompt)`, which calls `broadcastFrame()` instead of writing to any one HTTP stream. A new
  shared `serveSessionStream()` handles the connection lifecycle for *any* role: seed from
  `getBacklog()`, subscribe, drive `runPipeline()` only if `role === 'builder'`, relay every
  frame to this connection, and close once `session_ended` arrives. `/api/agent/stream` calls
  `claimSession()`; the new `/api/agent/spectate` (`spectatorStream.ts`) always passes
  `role: 'spectator'` without ever calling `claimSession()` — so a pure-visualization consumer
  can never win the builder race with no prompt attached. `SwarmCanvas`/`swarmStore.ts` now
  point at `/spectate`, not `/stream`.
- **`src/lib/sessionRoleStore.ts`** — tiny shared client store (`reportRole`/`currentRoleBadge`)
  so `EcosystemNav.tsx`'s header badge reflects whichever connection(s) *this browser tab*
  currently holds a role in, independent of which component opened them.
- **`src/lib/cookbookPresets.ts` + `CookbookDropdown.tsx`** — the 3 flagship presets, one-click
  launch via `sandboxStore.connectGenerator(preset.prompt)` (itself now a shared singleton export
  so the header dropdown and `AppPreview` observe/drive the same generation), plus a saved-runs
  list (`GET /api/sessions`) that replays a historical run "instantly" — `sandboxStore.setCode()`
  directly, skipping the ~2s pipeline re-animation, per the DoD's own wording.
- **`src/server/services/sessionSerializer.ts` + `GET /api/sessions[/:id]`** — writes
  `.codex/demos/[session-id].json` once a build completes. `loadSession()` validates the route
  param against a strict UUID regex before touching the filesystem (the id reaches it from a
  user-controlled path segment — rejecting anything else prevents path traversal).
- **B2B Lead Scoring Bot** — third flagship scenario in `appGeneratorPrompt.ts`: weighted
  threshold scoring (company size + budget + urgency), Hot/Warm/Cold classification, a simulated
  outbound webhook alert logged in-app on a Hot Lead. Matched via "lead"/"b2b"/"scoring" in the prompt.
- **`.codex/AGENTZ-STUDIO-SDK.md`** consolidated into the full Bible: platform layout diagram
  (with an explicit note on what was trimmed — no Command Drawer or in-app Bible viewer, neither
  was in the numbered DoD), governance/ceilings matrix, Merkle hash chain flow diagram,
  single-active-builder/spectator flow diagram, Scenario 3, and the Cookbook/replay section.

## Two real bugs found and fixed during verification (not assumed correct from reading the code)

### 1. Session serialization captured an incomplete audit trail
First version scheduled `recordCompletedBuild()` via `setTimeout(150ms)` immediately after Lead
Dev emits the generated code. Checking the actual written file showed only 9 of the expected 11
audit events — the snapshot fired before Lead Dev's own `DONE` and the entire Reviewer stage
(another ~1 second of pipeline execution) had happened. Moved the call to after "pipeline
complete" is broadcast. That exposed a second, subtler issue: even there, filtering the audit
chain by an `[auditStart, now)` index range isn't reliable, because a *new* build can claim the
lock and start enqueueing its own audit events almost immediately after this one ends — an
index-range snapshot can't tell those apart from this session's own tail events. Fixed properly
by tagging every `enqueueAuditEvent()` call with the owning `sessionId` (a new optional field on
`AuditBlock`, not part of the hash formula) and filtering by that
(`getSessionAuditBlocks(sessionId)`) instead of timing. Verified: the serialized record's
`auditBlocks` now contains exactly this session's 11 events, and every block's `sessionId`
matches the record's own `sessionId`.

### 2. (Ruled out, but worth recording) Suspected the unification would break AppPreview's boot demo
Before settling on the `/api/agent/spectate` split, the concern was: if `SwarmCanvas` used
`/api/agent/stream` with no prompt, it could occasionally win the builder race on page load ahead
of `AppPreview`'s prompted connection, running an unprompted build with no `generated_app_payload`
— `AppPreview` would then spectate that empty run and never show anything. Rather than trust that
reasoning, verified it directly: a two-tab test opening both nearly simultaneously confirmed both
tabs render the identical ACME Order heading (one builder, one genuine spectator), and the
dedicated `/spectate` endpoint means `SwarmCanvas` structurally cannot compete for the role at all.

## Verification
- `npx tsc -b` clean, `npm run build` clean.
- `npm run test:sse`: all original assertions still pass (updated for the new `session_role`/
  `session_ended` frames — first frame is now `session_role`, last is `session_ended`, not
  `system_alert` on both counts). Added `testSpectatorMode()`: starts a build, connects two more
  concurrent clients (one via `/stream`, one via `/spectate`), confirms all three see an
  *identical* `agent_step` sequence, all three end with `session_ended`, and a fresh connection
  afterward correctly claims a new `builder` role (lock released, not stuck).
- Real `NODE_ENV=production` boot: `GET /`, `GET /api/agent/spectate`, `GET /api/sessions` all
  200 with the site's headers unaffected.
- Playwright, full page: header badge shows `🟢 ACTIVE BUILDER` on load, Cookbook dropdown lists
  all 3 presets, launching **B2B Lead Scoring Bot** rendered and functioned correctly inside the
  sandbox (scored an enterprise/$5000/high-urgency lead as Hot, webhook alert logged), and the
  Cookbook's saved-runs list showed both completed builds immediately after.
- Playwright, two tabs: opened nearly simultaneously — confirmed via the sandboxed iframe's own
  `<h1>` that both tabs render the *identical* generated app (one builder, one true spectator,
  not two independent generations). Terminal's `run` command correctly printed the "spectating"
  notice when a build was already active. Clicking a saved run from the Cookbook in tab 2 loaded
  it with status staying `ready` throughout (no re-triggered `building` animation) — confirmed
  "instant" replay, not a re-run.
- Zero console errors across every one of the above.

## Risk/Debt
- `SwarmCanvas` doesn't auto-reconnect after a build's `session_ended` closes its stream — it
  will sit at the last-known state until the next page load. A future UOW wanting continuous
  multi-build spectating would need a reconnect loop in `swarmStore.ts`.
- The aspirational platform-layout diagram (section 8) includes a `☰ Command Drawer` and an
  in-app `📖 AgentZ Bible` viewer button — neither is in this UOW's numbered DoD and neither was
  built; the Bible remains this markdown file only. Documented explicitly in the SDK doc itself
  rather than silently diverging from the diagram.
- `CookbookDropdown.tsx`'s saved-runs list has no pagination/cap — `.codex/demos/` will grow
  unbounded over a long-running server (no retention worker for it, unlike the 72-hour one for
  `.codex/audits/`).
- `matchScenario()`'s keyword matching for the new B2B scenario ("lead"/"b2b"/"scoring") is as
  coarse as the existing two scenarios' matching — same class of limitation already noted in
  UOW-07/08's journals.
