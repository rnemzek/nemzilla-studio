# UOW-05 Journal — Ecosystem Portal & Production Hardening

## Task 5.1 — `src/components/EcosystemNav.tsx`
- Top nav bar mounted above the main content in `App.tsx`: brand mark (`NemZilla.net`) on the
  left, an `aria-label="Ecosystem quick-launch"` link row on the right with three targets —
  `robert.nemzilla.net`, `streaming.nemzilla.net`, `grid.nemzilla.net`.
- Each link opens `target="_blank"` with `rel="noopener noreferrer"` (external cross-subdomain
  navigation, no `window.opener` leak back to those sites).
- Same link set is reachable from `nemzilla-cli`'s existing `launch [target]` command
  (`robert` / `streaming` / `grid`), so the nav bar and terminal expose the same ecosystem
  targets through two surfaces.

## Task 5.2 — `src/server/middleware/securityHeaders.ts`
- Environment-gated middleware: `NODE_ENV !== 'production'` is a no-op (zero headers), so dev
  keeps HMR/Vite's own inline scripts and eval usage working. In production it sets:
  `Content-Security-Policy` (`default-src 'self'`, no inline/eval, `object-src 'none'`,
  `frame-ancestors 'none'`), `X-Frame-Options: DENY`,
  `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- Wired in as global middleware (`app.use('*', securityHeaders())`) in `src/server/app.ts`.
- Verified directly with curl against both a dev-mode and a `NODE_ENV=production` server:
  dev — no security headers present; prod — all five present with the expected values.

## Task 5.3 — Production build & Playwright E2E validation
- `npx tsc -b` and `npm run build` clean.
- **Bug found and fixed during validation:** `src/server/app.ts` originally chained
  `.basePath('/api')` on the exported `app` instance. Hono's `basePath()` scopes *all*
  subsequent route registrations on that instance — including ones added later, in a
  different file. `server.ts` adds the production static-file routes
  (`serveStatic({ root: './dist' })` + the SPA `index.html` fallback) onto that same `app`
  object, so they were silently registered under `/api/*` instead of `/*`. Result: in a real
  `NODE_ENV=production` boot, `GET /` returned 404 and the entire built SPA was unreachable —
  only `/api/assets/...` resolved. This predates this UOW (the `.basePath()` call was already
  there) but had never been exercised end-to-end in production mode before this task.
  - **Fix:** dropped `.basePath('/api')`; routes are now declared with explicit `/api/...`
    paths (`/api/health`, `/api/agent/stream`) on an unscoped `app`. `apiClient.ts`'s
    `hc<AppType>(window.location.origin)` needed no changes — the inferred route type is
    identical either way.
  - **Side benefit:** since middleware registered before the old `.basePath()` call was also
    silently scoped to `/api/*`, `securityHeaders()` was previously only ever applied to API
    responses in production, never to the actual HTML page load or static assets. It's now
    unscoped too, so CSP/HSTS/etc. correctly cover `/`, `/assets/*`, and the SPA fallback —
    not just JSON responses.
  - Re-verified post-fix: `GET /` → 200 with all five security headers and the real SPA root
    div; `GET /assets/<hash>.js` → 200; `GET /api/health` → 200 JSON; an arbitrary deep route
    (`/some/deep/route`) → 200 via the `index.html` SPA fallback, confirming client-side
    routing won't 404 on refresh.
- Playwright E2E (`.claude/skills/run-nemzilla-studio/driver.mjs help metrics "launch grid"
  triad clear`): zero console errors, exit 0. `00-initial.png` confirms the new
  `EcosystemNav` bar renders correctly alongside `SwarmCanvas` and `Terminal` (three
  quick-launch buttons, brand mark, no layout regression). `launch grid` step confirmed the
  CLI path logs the correct target URL.
- `npm run test:sse` re-run clean — no regression to the SSE pipeline from the routing change.

## Task 5.4 — Doc update, journal entry, & UOW-05 closure
- This file + `.codex/context.md` task checkboxes + `.codex/architect-journal.md` UOW-05 Sync
  entry (below) close out the UOW per the project's standing doc-closure convention.

## Risk/Debt carried forward
- No project-level automated E2E assertions exist yet for the production (`NODE_ENV=production`,
  built `dist/`) boot path specifically — Task 5.3's prod-mode checks were manual curl
  verification in this session, not a committed script. If production routing regresses again,
  it won't be caught by `npm run build` or `npm run test:sse` alone (both are dev/build-time
  only). Worth a follow-up: a small `verify-prod-boot.ts` script alongside
  `verify-agent-stream.ts` that builds, boots with `NODE_ENV=production`, and asserts `GET /`,
  `GET /assets/*`, and the SPA fallback all return 200.
