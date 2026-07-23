# UOW-13 Developer Journal — Pass B: The Step-by-Step Replay Scrubber

## Tracker naming note
This is the first session to log a UOW numbered 13 to `.codex/context.md`. An earlier, unlogged
session informally called its own LLM-driven PO/domain-agent refactor "UOW-13" before this one —
that work is documented under UOW-12's tracker note instead (see `uow-12.md`), and is unrelated to
what's built here.

## What was built

### 1. Replay Mode Controller
New `src/lib/replayStore.ts` — a global reactive singleton (`run`, `steps`, `stepIndex`, `playing`,
`speed: 1 | 2`), same bottom-of-file singleton pattern as `sandboxStore.ts`/`auditStore.ts` so any
component can read/drive it without an explicit prop chain.

`steps` is a saved run's `auditBlocks` filtered down to `AGENT_TRACE_ACTIONS` — the exact same set
`ArtifactsPanel.tsx`'s Agent Trace tab already used, which I moved from a local const in that file
onto `auditStore.ts` as a shared export. Keeping one copy of that set means the replay scrubber's
"Step X of Y" and the Agent Trace tab's row count can never silently drift apart.

`ArtifactsPanel.tsx`'s Run History tab gained two entry points:
- **"▶ Replay Current Run"** next to Save Run — replays whatever's live right now without
  requiring a save first. Builds an ephemeral `SavedRun`-shaped object (`id: 'live-session'`) from
  the exact same reactive sources `handleSaveRun()` already reads (`transcript()`, `catalog()`,
  `policyRules()`, `auditBlocks()`, `sandboxStore.state.code`) — no new data plumbing needed.
- **Per-row "▶ Replay"** — replays a specific saved run.

Both call `startReplay(run)`, which filters the run's blocks into `steps` and resets to step 0. A
banner ("▶ Replaying: {name} — see the Swarm panel...") appears in `ArtifactsPanel.tsx`, mirroring
the existing "Viewing saved run" banner's exact visual pattern, with an Exit Replay action. Deleting
a run that's currently being replayed also calls `stopReplay()` (parallel to the existing
`viewedRun` clear-on-delete logic).

### 2. Visual Packet Trajectory
The hard part here was making the replay render *identically* to how the run looked live, without
maintaining a second parallel state machine. `swarmStore.ts` already had `ensureAgent()` (adds an
agent to `stageOrder`, wires the incoming edge) and `RUN_START_AGENTS`-triggered resets — both were
private. I exported them and wrote `buildReplaySnapshot(steps, uptoIndex)`, which folds a run's
audit blocks up to the scrubbed index through that *exact* reducer:

```ts
export function buildReplaySnapshot(steps: AuditBlock[], uptoIndex: number): ReplaySwarmSnapshot {
  const draft: SwarmState = { stageOrder: [], agents: {}, edges: {}, connected: false, message: null }
  // ...folds agent_step EXECUTING/DONE blocks through ensureAgent()/resetForNewRun(),
  // tracking `focusAgent` and `packetEdge` (the hand-off edge, if the current step is one) along the way
}
```

Non-`agent_step` steps (`policy_check`, `generated_app_payload`, `pipeline_completed`) are
inspector-only — they don't move `focusAgent`/`packetEdge`, they just ride along with whichever
agent was last active. This means stepping onto a `policy_check` block shows the packet still
"sitting" at the agent that triggered it, which is exactly what actually happened in the live run.

`SwarmCanvas.tsx` gained a `view()` memo — the replay snapshot when `replayState.run` is set, else
the live `swarm.state` — and every render site (`stageOrder`/`agents`/`edges`) now reads through
`view()` instead of `swarm.state` directly. The live `/api/agent/spectate` connection is paused
while replaying via a `createEffect` gating `swarm.connect()`'s disconnect/reconnect, so a replay
session doesn't have the live feed silently mutating state underneath it — and resumes automatically
on Exit.

The scrubber header (Step X of Y, ⏮ Back, ▶ Play / ⏸ Pause, Forward ⏭, 1x/2x, ✕ Exit) mounts above
the SVG only while `inReplay()`. Play drives `stepForward()` on a `setInterval` (1400ms / speed)
that self-stops at the last step.

For the packet itself: I first tried SVG `<animateMotion>` keyed by step index, but restarting a
SMIL animation reliably across browsers when the same `d` path repeats (e.g. re-stepping back and
forward across the same edge) is a known cross-browser headache. Instead I used a plain
`requestAnimationFrame` tween — a `createEffect` watching `packetEdge()`/`stepIndex` computes a
linear interpolation between the edge's source/target node positions over ~900ms/speed and writes
it to a signal the packet `<circle>` reads. Simpler, and it restarts cleanly every time by
construction (the effect just re-runs and starts a fresh `raf` loop, cancelling the previous one via
`onCleanup`).

Node highlighting: an amber pulsing ring (`stroke-amber-400`, dashed, `animate-pulse`) renders
around whichever node(s) `isPacketFocus(agent)` returns true for — both endpoints of the current
hand-off edge, or just the single focus agent for non-hand-off steps.

### 3. Contextual Packet Inspector
A panel under the canvas (visible only in replay) shows the current step's `action`, formatted
`timestamp`, and pretty-printed `payload` JSON. Hovering a node calls `setHoveredAgent(agent)`
(cleared on pointer-leave, or automatically when replay ends); `inspectorBlock()` then walks
backwards from the current step index looking for that agent's most recent `agent_step` block,
falling back to "No step data for this run" if that agent hasn't acted yet at this point in the
scrub.

### 4. Runtime Policy Interceptor Visual
New `src/lib/policyTrajectoryStore.ts` — `playOrderTrajectory(total, decision)` drives a plain
3-stage timed sequence (500ms → stage 1, 700ms → stage 2, 1800ms → hide) rendered as a bar above the
`<iframe>` in `AppPreview.tsx`: "Cart Submitted" → "Policy Checked ($X · {decision label})" →
"Audit Ledger Signed", each stage lighting up in sequence with a pulse on the active one.

Wired into `sandboxStore.ts`'s existing `onMessage` handler at the `SANDBOX_MESSAGE.order` case,
right alongside the pre-existing `relayOrderEvent()` call — no new postMessage plumbing needed,
just one more reaction to a message that already arrives.

**Scope note worth flagging:** only swarm-synthesized apps (`swarmCodeSynthesizer.ts`, built from a
completed PO interview) actually posted `SANDBOX_MESSAGE.order` before this UOW. The default
boot-demo app (`buildAcmeOrderSnippet()` in `appGeneratorPrompt.ts`, what `<AppPreview/>` loads on
page load via `connectGenerator('ACME Order')`) never did — meaning this feature would've been
invisible unless a user ran the full PO interview → Andiamo flow first. I extended
`buildAcmeOrderSnippet()` to post the identical message (mirroring `swarmCodeSynthesizer.ts`'s
`postOrderEvent()` almost verbatim, including the duplicated `ORDER_MESSAGE_TYPE` constant — same
established reason as that file's own comment: `src/server` and `src/lib` are separate tsconfig
projects, so importing `SANDBOX_MESSAGE.order` across that boundary isn't viable). This needed a
`sessionId` for the relay to validate against `isValidSessionId()` — the classic pipeline's
builder-lock session id (`crypto.randomUUID()` from `sessionManager.claimSession()`) was already the
right shape, so I threaded it through `generateAppSnippet(userPrompt, sessionId)` →
`buildAcmeOrderSnippet(..., sessionId)`. Single caller (`agentStream.ts:199`), so this was a
low-risk signature change.

## Real bug found and fixed (not new in this UOW)
While setting up Playwright verification I noticed a genuine CSP violation console error in
production: `Applying inline style violates ... style-src 'self'`. Tracing it back:
`securityHeaders.ts`'s production CSP is `style-src 'self'` with no `unsafe-inline`, and
`SwarmCanvas.tsx`'s node glow effect (`STATUS_GLOW`) used an inline `style={{ filter: ... }}`
attribute — which that CSP silently blocks. This means the glow effect (a `active`/`thinking`/
`completed`/`error` node visual cue, present since well before this UOW) had **never actually
rendered in production**, despite multiple earlier UOWs' journal entries claiming "zero console
errors" during their own production-mode Playwright verification passes. Those passes evidently
never happened to check console output at the exact moment a glowing node was on screen, or didn't
treat a CSP violation report as disqualifying.

I found this because I added one more instance of the exact same anti-pattern (an inline `style`
filter for the new packet dot's drop-shadow) and my own verification caught it. Since it's the same
file I was already deep in, and a trivial, low-risk fix, I fixed both: converted `STATUS_GLOW` from
a map of raw CSS `filter` strings used via inline `style` into `STATUS_GLOW_CLASS`, a map of
Tailwind arbitrary-value classes (`drop-shadow-[0_0_6px_var(--color-accent-glow)]`, etc.) applied
via the existing `class` template string — Tailwind compiles these into the external stylesheet at
build time, which `style-src 'self'` happily allows. Did the same for the new packet dot
(`drop-shadow-[0_0_5px_rgba(251,191,36,0.9)]`).

## Verification
- `npx tsc -b` — clean.
- `npm run build` — clean (`tsc -b && vite build`).
- `npm run test:sse` — clean, all pre-existing SSE assertions unaffected (no server streaming
  contract changes; the `sessionId` threading through `generateAppSnippet` doesn't change any event
  shape or ordering).
- **Full production-mode Playwright verification** (`NODE_ENV=production`, per this project's
  established dev-server-HMR-reload-loop workaround), via a purpose-built script (not the repo's
  generic `nemzilla-cli` driver, since this required clicking into specific panel tabs/buttons
  rather than typing terminal commands):
  - Boot demo reaches `ready`; adding a $40 item (under the default $100 auto-approve ceiling) and
    submitting renders the 3-stage trajectory bar in the correct order with the correct decision
    label (`Policy Checked ($40 · Auto-Approved)`), auto-hiding ~1.8s after the final stage.
  - "▶ Replay Current Run" (enabled once there's audit trace activity) shows the "▶ Replaying:
    Current Session (live)" banner.
  - The Swarm Canvas scrubber shows "Step 1 of 10" on entry; Play advances the step counter over
    time; Pause stops it; Forward/Back move the counter by exactly one step each.
  - Stepping through all 10 steps individually confirmed: the packet dot (`circle.fill-amber-300`)
    and two focus rings (`circle.stroke-amber-400`) appear precisely on `EXECUTING` hand-off steps,
    a single focus ring persists (no dot) through `DONE` steps and through the intervening
    `policy_check`/`generated_app_payload` steps until the next hand-off, matching the intended
    "packet sits at the agent doing the work" semantics.
  - Packet Inspector shows the current step's `agent_step`/`policy_check`/`generated_app_payload`
    action, timestamp, and payload; hovering a node's label swaps the inspector to that agent's own
    last-known step.
  - Exit correctly tears down the scrubber and restores live mode.
  - **Zero console errors** after the CSP fix above (confirmed by re-running the same script before
    and after the fix — the violation was present before, absent after).

## Cleanup
Verification runs spun up throwaway servers on ports 5301–5303 and generated real
`.codex/audits/`/`.codex/demos/`/`.codex/sessions/` runtime artifacts plus screenshots under
`scripts/` — none of that is meant to be committed, so it was all deleted before finalizing this
UOW, along with the two `*.tmp.mjs` verification scripts themselves.

## UOW-13 complete
All 4 Pass B requirements shipped: Replay Mode Controller, Visual Packet Trajectory, Contextual
Packet Inspector, Runtime Policy Interceptor Visual — plus one genuine pre-existing CSP/inline-style
bug found and fixed along the way.
