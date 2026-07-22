# UOW-06 Developer Journal — AgentZ Studio Sandbox Preview Engine

## Scope as handed off
1. `src/components/AppPreview.tsx` — isolated `<iframe srcdoc="...">`, `sandbox="allow-scripts"`.
2. `src/lib/sandboxTemplate.ts` — HTML5 envelope helper (Tailwind CDN, Inter font, error boundary).
3. `src/lib/sandboxStore.ts` — reactive store for code / preview status / active tab.
4. Mount `AppPreview` in `App.tsx` alongside `SwarmCanvas` and `Terminal`.

## Architectural deviation (explicit, approved before implementation)
Literal `srcdoc` conflicts with UOW-05's shipped production CSP:
- Browsers apply the **embedding document's** CSP to `srcdoc`/`about:blank` frames. UOW-05's prod
  CSP is `script-src 'self'` and `frame-ancestors 'none'` — the latter would have blocked the
  frame from rendering inside our own page at all (not just the Tailwind CDN script), and the
  former would have blocked the CDN script and every inline `<script>` in generated code.
- This is the same *works-in-dev-breaks-in-prod* bug class UOW-05 itself caught and fixed (the
  `.basePath('/api')` routing bug) — dev's `securityHeaders()` is a no-op (`NODE_ENV !== 'production'`),
  so a literal `srcdoc` build would have looked fine locally and silently failed on Railway.

Presented three options to the architect (ship as spec'd + document as debt / loosen site-wide CSP
/ dedicated same-origin route with its own headers). Directed to build **Option 3**:

- **`src/server/routes/sandboxFrame.ts`** — new Hono route `GET /sandbox-frame` serving a minimal
  bootstrap shim with its own response headers: a CSP permissive only for this route
  (`script-src 'unsafe-inline' https://cdn.tailwindcss.com`, `style-src 'unsafe-inline'
  https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com`, `frame-ancestors 'self'`).
- **`src/server/middleware/securityHeaders.ts`** — one-line exemption: skips setting the strict
  site-wide CSP/XFO for `c.req.path === '/sandbox-frame'` (global middleware's `c.header()` calls
  run *after* `await next()`, i.e. after the route handler, so without this exemption the strict
  policy would silently clobber the route's own scoped one in production — worth flagging for
  whoever touches `securityHeaders.ts` next).
- **`server.ts`** — dev-mode routing (`req.url?.startsWith('/api')`) extended to also match
  `/sandbox-frame`, otherwise Vite's SPA middleware would intercept it and serve `index.html`.
- **`AppPreview.tsx`** — `<iframe src="/sandbox-frame" sandbox="allow-scripts">` instead of `srcdoc`.
- **`sandboxStore.ts`** — `postMessage` handshake instead of embedding code at build time:
  `ready` (child -> parent, frame loaded) -> `code` (parent -> child, full envelope HTML) ->
  `rendered` / `error` (child -> parent).

The iframe's `sandbox="allow-scripts"` (deliberately **without** `allow-same-origin`) remains the
real isolation boundary regardless of same-origin URL — the document executes in a unique opaque
origin, so it can't read the parent's cookies, storage, or DOM even though `/sandbox-frame` is
served from our own origin. The route's permissive CSP is a secondary/best-effort layer scoped to
one route, not a loosening of the app's actual security boundary.

## `document.write` re-render caveat
The shim posts `ready`, then on receiving `code` does `document.open(); document.write(html);
document.close()` to swap in the full envelope. Per the HTML spec, `document.open()` tears down
event listeners on the document/window — so a *second* `code` message after the frame has already
rendered once would arrive at a window with no listener left to catch it. Rather than have the
envelope re-register its own listener (more moving parts, more surface for the arbitrary generated
`<script>` content to interfere with), `sandboxStore.setCode()` forces a fresh navigation on
subsequent calls (`frame.src = '/sandbox-frame?t=' + Date.now()`, cache-busted so a same-URL
reassignment isn't a no-op) — full reload per code change, no partial-update path yet.

## Verification
- `npx tsc -b` clean, `npm run build` clean.
- Dev boot: `curl /sandbox-frame` confirmed 200 + the scoped CSP header, `curl /` confirmed the
  SPA shell still loads through Vite.
- **Production boot** (`NODE_ENV=production`, built `dist/`, direct `tsx server.ts`, no dev
  shortcuts): `GET /` → 200 with the full strict UOW-05 header set (`script-src 'self'`,
  `frame-ancestors 'none'`, HSTS, etc.) unchanged; `GET /sandbox-frame` → 200 with its own scoped
  CSP (`frame-ancestors 'self'`, Tailwind CDN allowed) — confirms the two policies coexist
  correctly rather than one clobbering the other, the specific failure mode this design avoids.
- Playwright (throwaway driver script, scratchpad-only, not committed — same pattern as UOW-03/04):
  loaded the real page, waited for the `ready`/`rendered` handshake, confirmed the iframe's own
  `document.body.innerText` contained the demo snippet's text, screenshotted both tabs. **Tailwind
  utility classes and the Inter font rendered correctly** inside the sandboxed frame (dark card,
  centered layout, correct type) once the CDN script had time to fetch and apply (~3s) — an
  earlier screenshot taken immediately after the `ready`/`rendered` messages showed a blank white
  frame simply because that fetch hadn't resolved yet, not a functional bug.
- Re-ran the project's existing `run-nemzilla-studio` driver (`help`, `metrics`, `triad`, `clear`)
  end-to-end with `AppPreview` mounted alongside `Terminal` — zero console errors, swarm canvas and
  terminal both continued working unaffected.
- `npm run test:sse` re-run clean (no regression).

## Risk/Debt
- No committed automated check exercises `/sandbox-frame` specifically (its dev-routing branch in
  `server.ts`, or its CSP header in prod) — today's verification was manual curl + a scratch
  Playwright script, mirroring UOW-05's own noted gap for `verify-prod-boot.ts`. A future
  `verify-sandbox-frame.ts` (same shape as `verify-agent-stream.ts`) would catch a regression here
  automatically instead of relying on manual re-checks.
- `setCode()` is exposed and functional but nothing yet calls it with real generated content — this
  UOW seeded a demo snippet in `AppPreview.tsx`'s `onMount` purely to prove the pipeline end-to-end
  in the browser. Wiring a real generation source (e.g. the swarm pipeline's Lead Dev output) into
  `setCode()` is future scope, not part of this UOW's ask.
- Full-reload-per-code-change (see `document.write` caveat above) means every update flickers the
  whole iframe; fine for an MVP preview, but a future iteration wanting flicker-free updates would
  need the envelope to re-register its own `message` listener after each write instead of relying
  on a fresh navigation.
