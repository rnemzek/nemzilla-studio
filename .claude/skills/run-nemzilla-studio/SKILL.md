---
name: run-nemzilla-studio
description: Build, run, and drive NemZilla Studio (SolidJS + Hono + Tailwind). Use when asked to start the app, launch the dev server, run/screenshot the AgentZ CLI terminal UI, verify the SSE agent stream, or check the production build.
---

NemZilla Studio is a browser-driven SolidJS + Hono app (Vite dev server with a
Hono API mounted at `/api/*` in the same Node process — see `server.ts`). Drive
it with `.claude/skills/run-nemzilla-studio/driver.mjs`, a headless-Chromium
script (Playwright) that spawns the real server, types commands into the
`AgentZ CLI` terminal component, and screenshots each step. `chromium-cli`
was not available in this container, so the driver uses the `playwright`
package directly (already a project devDependency).

All paths below are relative to the project root (`nemzilla-studio/`).

## Prerequisites

No OS packages needed on macOS/Linux with Node already installed (verified on
Node v25.9.0). Playwright's Chromium build must be present:

```bash
npx playwright install chromium   # no-op if already cached
```

## Setup

```bash
npm install   # installs hono, solid-js, vite, tailwindcss, playwright, etc.
```

## Build

```bash
npx tsc --noEmit    # type-check (also runs as part of `npm run build`)
npm run build       # tsc -b && vite build -> dist/
```

## Run (agent path)

```bash
node .claude/skills/run-nemzilla-studio/driver.mjs [command ...]
```

With no arguments it runs a default smoke scenario (`/help`, `/metrics`,
`/triad`, `/clear`) against a throwaway dev server on port 5301, then exits.
Pass your own AgentZ CLI slash commands as args to drive a specific scenario
instead, e.g.:

```bash
node .claude/skills/run-nemzilla-studio/driver.mjs "/launch grid" /run
```

Note: since Pass D, only `/`-prefixed input is a command — bare text (no
leading slash) routes straight to the AI PO conversational stream (a real,
billed Anthropic call if `ANTHROPIC_API_KEY` is configured). Always pass
slash-prefixed commands here unless you specifically mean to drive the PO
interview.

The driver: spawns `server.ts` directly via `node_modules/.bin/tsx` (not
`npm run dev` — see Gotchas), polls `/api/health` until it responds, launches
headless Chromium, types each command into the terminal's `<textarea>`, and
screenshots after every step plus the initial load. It prints each step's
`section` innerText and the full browser console-error list, then tears the
server down. Non-zero exit code means either the assertions failed or the
browser logged a console error.

Screenshots land in `.claude/skills/run-nemzilla-studio/screenshots/`, named
`00-initial.png`, `01-<command>.png`, `02-<command>.png`, etc. (overwritten
each run — copy out anything you want to keep).

| AgentZ CLI command | what it does |
|---|---|
| `/help` | Lists all slash commands |
| `/run [task]` | Streams the full agent pipeline (Planner → Architect → Lead Dev → Reviewer) with reasoning text |
| `/triad [task]` | Same pipeline, condensed (no token-by-token text) |
| `/metrics` | Calls `/api/health` via the `hc<AppType>` RPC client, prints status/uptime/round-trip latency |
| `/launch <target>` | Opens an ecosystem link (`robert`, `streaming`, `grid`) |
| `/build` | Starts the AI PO discovery interview explicitly |
| `/andiamo` | Launches the swarm build from a completed interview |
| `/replay` | Replays the current session step-by-step on the Swarm Canvas |
| `/reset` | Cancels any active interview and clears the terminal |
| `/admin` | Opens the Usage & Session Drawer |
| `/clear` | Empties the terminal log |

Env overrides: `PORT` (default `5301`), `HEADED=1` to watch it run in a
visible window instead of headless.

## Run (human path)

```bash
npm run dev   # tsx watch server.ts — Vite + Hono on http://localhost:3000
```
Open the URL in a browser; type commands into the terminal directly. Ctrl-C to
stop. (Useless in a headless container — that's what the driver is for.)

## Test

```bash
npm run test:sse   # spawns the server, fetch-drives /api/agent/stream,
                    # asserts event structure + abort/leak behavior
```
Expect: `All agent stream checks passed.` (~4s, two sub-checks).

---

## Gotchas

- **Spawn `tsx` directly, not `npm run dev &`.** npm's wrapper process does
  not forward `SIGTERM` to the child it spawns, so killing the npm process
  leaves the real server listening on the port and the next run hits
  `EADDRINUSE`. The driver spawns `node_modules/.bin/tsx server.ts` directly
  so `server.kill('SIGTERM')` actually stops it — confirmed via `lsof
  -ti:5301` returning nothing after the driver exits.
- **`chromium-cli` isn't installed in this container** (`which chromium-cli`
  fails) but Playwright's Chromium build was already cached at
  `~/Library/Caches/ms-playwright/chromium-1228`, matching `playwright@1.61.1`
  exactly — installing that version avoided any browser re-download.
- **`run`/`triad` need a longer wait than other commands** — the simulated
  4-stage pipeline takes ~2s end-to-end (40ms/token + 150ms/stage gap on the
  server). The driver waits 2500ms after those two commands and only 300ms
  after everything else; a fixed short wait for all commands screenshots the
  stream mid-flight.
- **Terminal output was inheriting `text-center`** from the page's hero
  `<main>` wrapper the first time this was screenshotted — CSS `text-align`
  inherits through the tree, so a component nested under a centered layout
  needs its own explicit `text-left` (see `src/components/Terminal.tsx`).

## Troubleshooting

- **`EADDRINUSE` on port 5301**: a previous run's server didn't get cleaned
  up. `lsof -ti:5301 -sTCP:LISTEN | xargs -r kill`, then re-run.
- **Screenshot shows the SPA shell but an empty terminal / stale text**: the
  wait after a `run`/`triad` command was too short for that machine — bump
  the 2500ms delay in `driver.mjs` if the pipeline hasn't finished streaming.
