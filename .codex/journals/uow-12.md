# UOW-12 Developer Journal — Pass A: Conversational UX Polish, Telemetry Deck & Swarm Pipeline Feedback

## Tracker gap noted up front
A prior session ran an LLM-driven refactor of the AI PO interviewer and domain-agent classifier —
referenced in that session as "UOW-13" — after UOW-11 shipped. It's real and already in the
codebase (`poInterviewLLM.ts`, `domainAgents.ts`, `anthropicClient.ts` all bear its marks), but it
was never logged to `.codex/context.md`/`architect-journal.md` per this project's own rules. This
UOW builds directly on top of that work; the gap is flagged in `context.md` rather than silently
carried forward.

## What was built

### 1. Removing the "andiamo" secret word
The AI PO's completion message used to instruct the user to type the literal word "andiamo" to
launch the build — a fun easter egg, but also the *only* documented way in, which reads as an
arbitrary command-line trivia quiz to a first-time user. `poInterviewLLM.ts`'s `SYSTEM_PROMPT` now
tells the user "Ready to build your app? Click 'Build' below or type 'build' to launch it."

`terminalCommands.ts` gained `LAUNCH_TRIGGER_PHRASES` — a `Set` of natural phrases ("build",
"build it", "go", "looks good", "make the app", "ship it", "launch", "start build", and a few more,
plus "andiamo" itself, silently preserved) matched via `isLaunchTrigger()`. The check happens in
`runCommand()` right after the "interview still in progress" branch and *before* the `switch`
statement dispatches on the literal command word:

```ts
if (activeInterview?.done && isLaunchTrigger(trimmed)) {
  await runAndiamo(ctx)
  return
}
```

This ordering is load-bearing, not stylistic. Without it, typing the bare word "build" once the
interview is already `done` would fall through to the `switch`'s `case 'build': await
startInterview(ctx)` — silently discarding the just-completed interview and starting a brand new,
unrelated one. Checking the launch-trigger set first means "build" (and "andiamo", and everything
else in the set) is interpreted as "launch what I already told you" whenever an interview is done,
and only reverts to "start a fresh interview" once none is active.

For the CTA *button* (not just typed text) to exist, `Terminal.tsx` needed to know reactively when
`activeInterview.done` flips true — but `activeInterview` in `terminalCommands.ts` is a plain
mutable object, mutated in place by `poInterview.ts`'s `applyTurn()` (`state.transcript.push(...)`,
`state.vendorName = ...`, etc.), never a Solid store itself. New `src/lib/interviewStore.ts` is a
thin one-way mirror: `publishInterviewSnapshot(activeInterview)` is called after every
start/turn/cancel, shallow-copying the current state into a real `createStore`. `Terminal.tsx`
renders a "Ready to build your app? Click Build" button whenever `interviewState.interview?.done`
is true, and clicking it calls the exact same `runCommand('build', ctx)` path a typed phrase would
— one code path, two entry points.

### 2. Artifacts & Telemetry Deck
New `src/components/ArtifactsPanel.tsx`. The DoD's phrasing — "extend the tab bar" — pointed at
`AppPreview.tsx`'s existing Preview/Source tab bar rather than a new standalone panel, so this
became a 3rd tab ("Artifacts / Telemetry") inside the same card, not a 4th column in the page grid.

Four sub-tabs, each reading from state that already exists rather than opening new connections:
- **Discovery Transcript** — `interviewState.interview.transcript`, live.
- **Prompt & Payload Inspector** — a 3-section accordion. "System Prompt" fetches once from a new
  `GET /api/po/interview/meta` (returns `{ systemPrompt: SYSTEM_PROMPT }`) rather than hand-copying
  the string client-side, which would silently drift the next time the prompt changes. "User
  Inputs" and "Extracted JSON" (`catalog`/`policyRules`) read the same live interview state.
- **Agent Trace** — filters the audit ledger's own blocks down to `agent_step`/`policy_check`/
  `generated_app_payload`/`pipeline_completed` and renders them chronologically. Because it reads
  raw `action`/`payload.agent` strings rather than assuming a fixed agent list, it renders both the
  classic pipeline and the swarm pipeline's dynamic agent names identically, with zero pipeline-
  specific code.
- **Run History** — see below.

`auditStore.ts` gained a bottom-of-file singleton (`export const auditStore = createAuditStore()`),
mirroring `sandboxStore.ts`'s existing pattern. `AuditLedgerPanel.tsx` was switched to import it
instead of calling `createAuditStore()` itself, and the new Agent Trace view reads the *same*
instance — deliberately never calling `.connect()` a second time, since a second call would open a
redundant `/api/audit/stream` connection and reset `blocks` out from under whichever view connected
first.

### 3. Swarm Canvas wired to real, dynamic execution — and a real bug found along the way
`swarmStore.ts`/`SwarmCanvas.tsx` used to hardcode the classic pipeline's 4 agent names (`Planner`,
`Architect`, `Lead Dev`, `Reviewer`) — anything else (`PO`, `Policy`, `AI Sport`, ...) was silently
dropped (`if (idx === -1) break`), a gap explicitly flagged as debt back in UOW-11's own journal.
This UOW closes it: `AgentName` is now `string`, `SwarmState.stageOrder` is a dynamically-growing
array populated as real `agent_step` events name new stages, and `RUN_START_AGENTS` (`Planner` or
`PO` going `EXECUTING`) triggers a full reset so a fresh run never inherits stale nodes from
whatever ran before it. Node radius self-scales (30 / 24 / 20 px at ≤4 / ≤6 / >6 stages) since a
full swarm run (`PO → Architect → 1-4 domain agents → Policy → Lead Dev`) can have twice the
classic pipeline's node count. Curated micro-status badges ("Synthesizing UI...", "Compiling
blueprint...", ...) render under the active/thinking node; anything not explicitly listed (a
dynamically-dispatched domain agent) falls back to `"Modeling {agent} schema..."` — the canvas
never needs to know the full domain-agent registry ahead of time.

**The bug:** first live verification pass had the canvas render the classic pipeline correctly on
page load, then never move again — even once a real swarm build was demonstrably running (the
Agent Trace view showed `PO`/`Architect`/`AI Vendor`/`AI OE`/`Policy` events arriving correctly the
whole time). Root cause: `/api/agent/spectate` is a genuinely *per-build* stream by design — it
sends a `session_ended` frame and the connection closes the moment the build it's watching
finishes (this exact shape is asserted by `scripts/verify-agent-stream.ts`). `swarmStore.ts`'s
`connect()` opened that stream exactly once and never reopened it, so the canvas was, from the very
first build's completion onward, watching a dead connection — it just happened to still be
displaying the last frame it ever received, which looked like "the canvas didn't update" rather
than "the canvas is disconnected."

Two ways to fix this were considered. Loosening the server's `serveSessionStream()` so a
`role: 'spectator'` connection doesn't close on `session_ended` would also work, but it's the
*documented, tested* contract other consumers (a second browser tab spectating via `/api/agent/
stream`, `scripts/verify-agent-stream.ts` itself) depend on — changing it risks a much wider blast
radius for a client-side-only problem. Instead, `swarmStore.ts`'s `connect()` now loops: each
natural stream close (a build ending) triggers an immediate reconnect, picking up whatever runs
next, with a 1s backoff only on genuine connection errors. Verified live: default classic run on
page load → canvas shows Planner→Reviewer all "done" → full interview → swarm build launched →
canvas correctly resets to empty and regrows `PO`(1)→`Architect`(2)→`AI Vendor`(3)→`AI OE`(4) with
live pulse/glow/micro-status at each step.

### 4. Persistent Run Saving ("Save Run")
New `src/lib/runHistoryStore.ts` — `localStorage`-only, deliberately not round-tripped to the
server (a personal, per-browser run history, distinct from `recipeStore.ts`'s existing code-only,
server-archived "Save to Cookbook"). `saveRun()` captures the full bundle: transcript,
`catalog`/`policyRules`, this run's own audit ledger blocks, and the generated code — everything
needed to inspect a past run without re-running anything.

Surfaced in `ArtifactsPanel.tsx`'s Run History sub-tab: a `📦 Save Run` button (gated on
`sandbox.state.status === 'ready'`, matching `SaveRecipeModal.tsx`'s existing gate so it can't
capture an empty/in-flight build), and per-saved-run `View` / `Load` / `✕` actions. `View` sets a
local `viewedRun` signal that switches the Transcript/Inspector/Trace sub-tabs into a read-only
historical view (amber "Viewing saved run — Back to Live" banner) — deliberately kept as
component-local state, never touching the live `interviewState` singleton, so browsing an old run
can never be mistaken for, or interfere with, whatever interview is actually in progress. `Load`
reuses the existing `sandboxStore.setCode()` to push the saved code back into `<AppPreview/>`.

## A test-harness false alarm, for the record
Mid-verification, a Playwright script clicking a Run History row's "View" button appeared to
somehow flip `<AppPreview/>`'s top-level tab back to "App Preview". Bounding-box comparison showed
`page.locator('button:has-text("View"))')` and `page.locator('button:has-text("App Preview")')`
resolving to the *same element* — because `:has-text()` is a substring match, and "App PreVIEW"
contains "view" verbatim. `.first()` picked the DOM-earlier "App Preview" tab button instead of the
intended Run History row button. Switched the test to `page.getByRole('button', { name: 'View',
exact: true })` and the flow verified correctly end to end. No application code was at fault —
noted here only so a future session doesn't waste time chasing the same ghost.

## Verification
- `npx tsc -b` / `npm run build`: clean throughout every edit.
- `npm run test:sse`: unaffected — the spectate-reconnect fix was made entirely client-side, so
  every assertion about `session_ended` being the last frame of a spectator connection still holds
  exactly as written.
- Full live browser verification (production-mode boot, per this project's established Vite-HMR-
  reload-storm workaround): three complete discovery interviews (bakery, hardware store,
  sports-merchandise fan shop) run end to end through the real Anthropic API, covering the new CTA
  copy, the "Ready to build" button, natural-phrase launch triggers, correct domain-agent dispatch
  (`AI Sport` firing only for the sports vendor), the Swarm Canvas's dynamic growth/reset/badges
  across a full swarm run, all three Artifacts sub-tabs rendering live data, and the complete Save
  Run → View → Back to Live → Load round trip. Zero console/page errors observed at any point.
