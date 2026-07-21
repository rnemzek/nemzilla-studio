# UOW-03 Journal — Interactive Terminal Shell (`nemzilla-cli`)

## Task 3.1 — `src/components/Terminal.tsx`
- CLI shell rendered as a bordered "window" (traffic-light dots + label) with a scrolling
  output log and a single-line prompt input.
- State: `createStore<TerminalLine[]>` for the output log (appended via `produce(draft =>
  draft.push(...))` — an in-place mutation rather than spreading/rebuilding the whole array
  on every line, so `<For>` only patches the new DOM node instead of re-diffing the full
  log). `createSignal` for the current input value, command history array, and the
  in-progress history-navigation index; a separate `isRunning` signal disables the input
  while an async command (`run`/`triad`/`metrics`) is in flight.
- Keyboard navigation: `ArrowUp`/`ArrowDown` walk `history()` and fill the input, matching
  standard shell behavior (Down past the newest entry clears back to an empty prompt).
  `Enter` submits.
- Auto-scroll: a `createEffect` reads `lines.length` (establishing the reactive dependency)
  and sets `scrollRef.scrollTop = scrollRef.scrollHeight` on every append.
- Clicking anywhere in the terminal focuses the input, matching real terminal-window UX.

## Task 3.2 — Command parser (`src/lib/terminalCommands.ts`)
- `runCommand(rawInput, ctx)` where `ctx` exposes `print`/`clear` callbacks — keeps parsing/
  command logic out of the component so the UI stays focused on rendering and input
  handling.
- Commands: `help` (lists all commands), `run [task]` (verbose full pipeline stream,
  including buffered reasoning text per agent), `triad` (condensed pipeline stream —
  `agent_step`/`metric_tick`/`system_alert` only, no token noise), `metrics` (health +
  latency), `launch [target]` (opens one of the ecosystem quick-launch targets from the
  README — `robert`, `streaming`, `grid` — or lists them), `clear` (empties the log).
- Unknown commands print an error line naming the offending command.

## Task 3.3 — Hono RPC wiring (`src/lib/apiClient.ts`)
- `export const apiClient = hc<AppType>(window.location.origin)` — a single typed client
  shared by both `metrics` (`apiClient.api.health.$get()`) and the stream commands
  (`apiClient.api.agent.stream.$get()`, consumed via its `res.body` reader since it's an
  SSE stream, not a JSON endpoint).
- `metrics` measures round-trip latency client-side (`performance.now()` around the
  `$get()` call) and reports it alongside the server-reported `status`/`uptime`/`timestamp`
  — satisfies "live latency, health, and uptime queries" without needing a new endpoint.
- **tsconfig note:** `apiClient.ts` does `import type { AppType } from '../server/app.ts'`.
  Because `AppType`'s shape is inferred from the whole `app.ts` source (not a prebuilt
  `.d.ts`), and `app.ts` calls `process.uptime()`, the *browser* TS project needs the
  `node` global types to fully elaborate that import — even though it's `import type` and
  erased at build time. Added `"node"` to `tsconfig.app.json`'s `types` array to satisfy
  this. This is the standard tradeoff for Hono's `hc<AppType>` pattern short of setting up
  full composite-project declaration boundaries between client and server; it does not
  change what runs in the browser bundle.

## Task 3.4 — Verification
- `npx tsc --noEmit` — clean.
- `npm run build` (`tsc -b && vite build`) — clean. (`tsc -b` briefly caught a real
  `noUnusedParameters` violation in `terminalCommands.ts` — the `agent` param in
  `flushTokens` wasn't used in the printed line — fixed by including it: `[${agent}] "..."`.
  Same lesson as UOW-01: `tsc -b`'s project-reference build is the one that actually
  enforces per-project lint options; plain `tsc --noEmit` didn't flag it.)
- **Browser verification** (no project run-skill existed yet, so used the generic
  browser-driven pattern: dev server + a throwaway Playwright script in the scratchpad,
  Chromium already cached locally): drove the live UI end-to-end — initial render, `help`,
  `metrics` (live `/api/health` round trip), `triad` (condensed SSE stream, all 4 agents,
  no token noise), `ArrowUp`/`ArrowDown` history recall, `clear`. Zero console errors.
  Caught and fixed one real issue this way: the terminal's output lines were inheriting
  `text-center` from the page's hero `<main>` wrapper, making CLI output look centered
  instead of left-aligned like a real terminal — fixed by adding `text-left` on the
  terminal `<section>`. Re-ran the driver after the fix to confirm.
- `npm run test:sse` (from UOW-02) re-run to confirm no regression — still all green.
