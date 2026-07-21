# UOW-01 Journal — Repository Initialization & Core Architecture

## Task 1.1 — Vite + SolidJS + TypeScript scaffolding with Hono server mounting
- Scaffolded via `npm create vite@latest -- --template solid-ts` (generated into a temp dir
  and merged in, since the target directory already held `.codex/`, `.env*`, and docs).
- Removed demo assets (`hero.png`, `solid.svg`, `vite.svg`, `icons.svg`, `App.css`) and
  replaced `App.tsx` with a minimal placeholder.
- Added `src/server/app.ts` — a `Hono` instance mounted at `/api`, exporting `AppType`
  for future `hc<AppType>` RPC client usage.
- Added root `server.ts` bootstrap: in dev, creates a Vite server in middleware mode and a
  plain `http.createServer` that routes `/api/*` to the Hono fetch listener
  (`getRequestListener`) and everything else to Vite's connect middleware; in production,
  mounts `@hono/node-server/serve-static` on the Hono app itself (serving `dist/` with an
  `index.html` SPA fallback) and boots it via `@hono/node-server`'s `serve()`.
- `package.json` scripts: `dev` (`tsx watch server.ts`), `build` (`tsc -b && vite build`),
  `start` (`NODE_ENV=production tsx server.ts`), `preview` (`vite preview`).
- Verified: hitting `/` returns the SPA shell (200); hitting `/api/` returns Hono's own
  404 (not Vite's SPA fallback), confirming the mount intercepts before Vite.

## Task 1.2 — Tailwind CSS, design tokens, base typography
- Installed `tailwindcss` + `@tailwindcss/vite`; wired the plugin into `vite.config.ts`.
- `src/index.css`: `@theme` block defining dark-theme color tokens (`--color-bg`,
  `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-text`,
  `--color-text-muted`, `--color-accent`, `--color-accent-soft`, `--color-accent-glow`)
  and font tokens (`--font-sans`, `--font-mono`).
- `@layer base`: dark `color-scheme`, body background/text/font, heading weight/tracking,
  monospace for `code`/`pre`.
- Custom `@utility radial-glow`: radial-gradient glow anchored top-center, built from the
  accent-glow token via `color-mix`.
- `App.tsx` updated to consume the tokens/utility (`bg-bg`, `text-text`, `text-text-muted`,
  `radial-glow`) as a live smoke test.
- Verified: `npm run build` produces compiled CSS containing the `radial-glow` utility and
  its resolved accent-glow color, confirming the token pipeline works end to end.

## Task 1.3 — `.env.sample` + `/api/health`
- Filled in `.env.sample` with the keys `server.ts` actually reads: `PORT`, `NODE_ENV`,
  plus the pre-existing local-only `LOCALHOST_IP` key (left blank in the sample).
- Added `GET /api/health` to `src/server/app.ts`, returning `{ status, uptime, timestamp }`.
- Verified: `curl http://localhost:<port>/api/health` → `200` with a live JSON payload.

## Verification summary
- `npx tsc --noEmit` — clean, no errors.
- `npm run build` (`tsc -b`, project-reference mode) initially failed: `src/server/app.ts`
  was picked up by both `tsconfig.app.json` (browser/DOM types, no `node` types) and
  `tsconfig.node.json`, erroring on `process`. Fixed by excluding `src/server` from
  `tsconfig.app.json`'s include set — server code now belongs solely to the node project.
  Plain `tsc --noEmit` hadn't caught this since it doesn't build per-project references the
  way `tsc -b` does; worth remembering for future UOWs that touch both `src/` and
  `src/server/`.
- `npm run build` — clean production build (client bundle + compiled Tailwind CSS).
- Manual runtime checks against `tsx server.ts` for `/`, `/api/` (404 sanity check), and
  `/api/health` (200 with payload) — all passed.
