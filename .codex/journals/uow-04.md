# UOW-04 Journal — Multi-Agent Swarm Canvas UI

**Re-scoping note:** Tasks 4.2 and 4.3 were executed against a different spec than the
original roadmap wording in `.codex/context.md`. The Lead Architect re-scoped them directly
in-session:
- Original 4.2 ("wire Swarm canvas to SolidJS SSE store") was deferred and re-assigned to 4.3.
- 4.2 was redirected to force-directed graph positioning instead.
- Original 4.3 ("interactive node click triggers to view individual agent reasoning logs")
  was **not** built this UOW — it's deferred to a future UOW/backlog item (see Risk/Debt).
`context.md` has been updated to describe what was actually built under each task number.

## Task 4.1 — `src/components/SwarmCanvas.tsx`
- Responsive SVG node-graph: Planner → Architect → Lead Dev → Reviewer, each node a labeled
  circle, connected by an accent-colored path with arrowheads plus a dotted feedback arc
  looping Reviewer back to Planner (the continuous swarm cycle).
- "Active data paths" delivered via a CSS `swarm-flow` keyframe (`src/index.css`) animating
  `stroke-dashoffset` on the forward edges.
- Mounted into `App.tsx` alongside `Terminal`, matching the architecture doc's three-panel
  client layout.
- Caught and fixed a regression this task surfaced: adding a second `<section>` to the page
  broke the run-skill driver's generic `section` selector (Playwright strict-mode
  violation). Fixed with `data-testid="terminal"` / `data-testid="swarm-canvas"` on both
  components and updated `driver.mjs` to target the terminal specifically.

## Task 4.2 — `src/lib/swarmLayout.ts` (force-directed graph positioning)
- Minimal d3-force-style simulation: pairwise repulsion (Coulomb-like), spring links
  (Hooke's law) toward a target `linkDistance`, a weak centering force, and — added in a
  follow-up pass — a per-node **anchor spring** pulling each node back toward its original
  pipeline coordinate.
- Key design point: the anchor force is deliberately **not** scaled by `alpha` (unlike
  repulsion/links/center, which fade out as the simulation settles). This guarantees the
  final resting state is always at the anchors, not wherever repulsion/links happen to
  balance — without it, a 4-node chain settles into an arbitrary bent/rotated arc instead of
  the intended straight line (repulsion between non-adjacent nodes bows the chain outward).
- `SwarmCanvas.tsx` seeds each node with a small random jitter off its anchor so the
  simulation has visible settling work to do, then pipes `runLayoutSimulation`'s per-frame
  positions into a `createStore`; every node/edge reads positions reactively instead of
  fixed coordinates.
- **Verified numerically** (not just visually): a throwaway script ran the simulation to
  full convergence from 5 different random starts — every node landed within 0.2px of its
  anchor, and `y` coordinates matched to 3 decimal places (a genuinely straight horizontal
  line every time, regardless of starting jitter).

## Task 4.3 — `src/lib/swarmStore.ts` (reactive SSE-driven swarm state)
- `createSwarmStore()` owns per-agent status (`idle → active → thinking → active →
  completed`, or `error` on a dropped connection) and per-edge "data in transit" flags, and
  parses `/api/agent/stream` SSE frames directly:
  - `agent_step EXECUTING` → agent `active`; the edge feeding into it clears.
  - `token_stream` → agent `thinking`.
  - `metric_tick` → agent back to `active` (wrapping up), records `latencyMs`/`memoryMb`.
  - `agent_step DONE` → agent `completed`; the edge to the *next* agent lights up (baton
    passed).
  - A stream failure (not a deliberate abort) flips whichever agent was `active`/`thinking`
    to `error`.
- `connect()` uses its own `AbortController` and returns a disconnect function — same
  abort-safety pattern already established in `terminalCommands.ts` and the UOW-02 SSE
  service.
- `SwarmCanvas.tsx`'s old placeholder `activeAgent` prop (from 4.1, meant as a future
  integration point) was removed — the store is now the live source of truth. Status maps
  to stroke color/glow/pulse per node plus a status label ("thinking…", "executing", "done",
  "error") replacing the idle role subtitle.
- **Design call, not yet acted on:** the canvas auto-connects once on mount and shows one
  full pipeline run, then rests at "done." It does not loop/reconnect automatically, and it
  is a separate SSE connection from whatever the terminal's `run`/`triad` commands trigger
  — the two are not synchronized. Flagged to the user; no action requested yet.

## Task 4.4 — Verification & closure
- Ran `.claude/skills/run-nemzilla-studio/driver.mjs` (the run-skill from UOW-03) fresh:
  screenshots generated for all 5 steps (`00-initial` through `04-clear`), zero console
  errors. `00-initial.png` (captured after Playwright's `networkidle` wait, which — usefully
  — blocked until the swarm's own auto-started stream had already finished) shows all four
  nodes in the glowing green `completed` ring state with edges reset to idle, confirming the
  full SSE → store → render pipeline end to end. `03-triad.png` shows the terminal's
  independent `triad` run completing correctly alongside it.
- `npx tsc --noEmit` — clean.
- `npm run build` (`tsc -b && vite build`) — clean.
- `npm run test:sse` (re-run during 4.3) — all green, no regression to the raw SSE endpoint.

## Risk/Debt carried forward
- Original Task 4.3 scope (interactive node click → view that agent's reasoning log) was
  never built this UOW. `swarmStore.ts` doesn't currently retain per-agent token/reasoning
  history (only the latest `latencyMs`/`memoryMb`), so this would need a small extension
  (e.g. an accumulating `tokens: string[]` per agent) before a click handler could show
  anything meaningful.
- Swarm canvas and terminal each open independent `/api/agent/stream` connections; a
  shared/synchronized session is a possible future improvement if that divergence becomes
  confusing in practice.
