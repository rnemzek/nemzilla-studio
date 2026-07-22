# UOW-10 Developer Journal — Command Center Drawer, Navigation Polish & AgentZ Bible Viewer

## What was built
- **`src/components/CommandCenterDrawer.tsx`** — a real slide-out panel (not a simple anchored
  dropdown like `CookbookDropdown.tsx`, to visually differentiate "a navigation surface" from "an
  action menu"). Always rendered in the DOM with `translate-x-0` / `-translate-x-full` toggled by
  Tailwind's `transition-transform`, rather than conditionally mounted via `<Show>` — mount/unmount
  can't animate a slide, since there's no element present partway through the transition. Four
  rich cards: NemZilla Studio (marked "Current"), Robert Nemzek, StreamZilla, GridZilla — replacing
  the old inline `<a>` links entirely.
- **`src/lib/markdown.ts`** — a minimal hand-rolled markdown parser (headings, fenced code blocks,
  bold/inline-code/links, bullet & numbered lists, GFM pipe tables, horizontal rules). Deliberately
  not a full CommonMark implementation and deliberately not a new dependency — this project has
  stayed dependency-free for every "nice to have" rendering need so far (e.g. the Source Code tab
  in `AppPreview.tsx` stayed plain monospace rather than pulling in a syntax highlighter back in
  UOW-06), and the Bible doc's actual markdown usage is narrow enough that hand-rolling it stays
  simple and maintainable rather than pulling in `marked`/`markdown-it` for one file.
- **`src/components/BibleModal.tsx`** — fetches `/api/bible` on open (`createResource` keyed off
  the open/closed signal — Solid skips the fetcher entirely while the source is falsy, so it
  doesn't fetch until actually opened), renders through the parser into real Solid JSX nodes block
  by block (not `innerHTML` — even though the content is our own trusted file, rendering via JSX
  keeps this consistent with not having any raw-HTML-injection code path in the client at all).
  Link hrefs are checked against a `SAFE_HREF` allow-list (`http(s)://`, `/`, `#`) before being
  rendered as real anchors — cheap defense-in-depth against a stray `javascript:`-style href ever
  ending up in the doc, even though nothing untrusted reaches this path today.
- **`src/server/routes/bible.ts`** (`GET /api/bible`) — reads `.codex/AGENTZ-STUDIO-SDK.md` fresh
  off disk on every request. The DoD explicitly allowed either "an API endpoint or a static bundle
  render" — chose the API endpoint deliberately: this doc has been rewritten in every one of the
  last four UOWs, and a Vite `?raw` build-time import would freeze whatever content existed at
  build time, showing stale docs in a running production server until the next deploy. A live
  file read costs nothing extra here (small file, infrequent reads) and keeps the viewer honest.
- **`EcosystemNav.tsx`** restructured: brand + `CommandCenterDrawer` on the left; `BibleModal`,
  `CookbookDropdown`, and the role badge on the right, matching the DoD's stated order once
  Command Center's explicit "top-left" placement is accounted for. Button labels wrapped in
  `hidden sm:inline` spans (icon-only below the `sm` breakpoint), header given `flex-wrap` as a
  safety net, badge padding/font-size shrinks slightly below `sm`.

## A real bug hunted down during verification — but it wasn't in this UOW's code
First browser verification pass showed the page failing to ever reach "ready": Vite's client
console log (`[vite] connecting...` / `connected.`) kept repeating dozens of times in a few
seconds, and the rate limiter started rejecting requests. Traced it with `page.on('framenavigated')`
logging — the *main frame* was genuinely reloading in a tight loop, not just reconnecting a
WebSocket. `ps aux` turned up two stray `tsx watch server.ts` processes left running from earlier
in this session (one from ~7:13am, one timestamped oddly at 4:22pm) — each with its own Vite file
watcher, each reacting to the source edits made throughout this UOW and pushing HMR/reload signals
that collided with whatever fresh test server + browser I'd just spun up. This matches a gotcha
the project's own `run-nemzilla-studio` skill already documents: `npm run dev &`'s wrapper process
doesn't forward `SIGTERM` to the `tsx` child it spawns, so killing a port listener from an earlier
session doesn't necessarily kill the underlying dev server. Killed both stray PIDs (confirmed they
belonged to this project and not, e.g., the two legitimate unrelated Vite instances also present
on the machine for entirely different projects — checked each PID's cwd before touching anything),
reran the exact same verification script unmodified, and it passed cleanly. Recorded here since
it's a recurring risk for future UOWs in this project, not something this UOW's code caused.

## Verification
- `npx tsc -b` clean, `npm run build` clean, `npm run test:sse` clean (this UOW touches no
  server-side pipeline logic, so the existing suite is an unaffected regression check).
- Real `NODE_ENV=production` boot: `GET /` 200, `GET /api/bible` 200 with real markdown content.
- Playwright, desktop (1500px): screenshotted the header, opened the Command Center drawer
  (bounding box `x: 0` while open), closed it via backdrop click (bounding box `x: -384`,
  confirming a genuine slide off-screen, not just a CSS no-op), opened the Bible modal and
  confirmed it contains real content from multiple sections (`"Governance & System Ceilings
  Matrix"`, `"SHA256"` from the hash-chain diagram), closed it via the ✕ button and confirmed it's
  gone from the DOM. Zero console errors.
- Playwright, mobile (375px) and tablet (768px): `document.documentElement.scrollWidth >
  clientWidth` checked explicitly at both widths — `false` in both cases (no horizontal overflow).
  Screenshotted the mobile drawer (fills the narrow viewport appropriately) and the tablet header
  (all four controls visible with full text labels, no clipping).

## Risk/Debt
- `markdown.ts` is intentionally narrow — it handles exactly what `AGENTZ-STUDIO-SDK.md` uses
  today. If a future UOW's doc edit introduces markdown syntax outside this subset (e.g. nested
  lists, blockquotes, inline images), it will render as literal text rather than formatted content
  — acceptable for a single internal doc viewer, not something to generalize preemptively.
- The doc's leftover `$\rightarrow$` LaTeX-style arrows (written in earlier UOWs, before this
  viewer existed) render as literal text in the modal rather than an arrow glyph — pre-existing
  content, not something this UOW's viewer feature should silently "fix" by rewriting the source
  doc's prose.
- No automated test covers the drawer/modal UI directly (Playwright verification was manual this
  UOW, not committed) — matches the project's existing pattern of manual-Playwright-only UI
  verification for components without a dedicated `verify-*.ts` script (e.g. `AppPreview.tsx`,
  `AuditLedgerPanel.tsx`).

---

## Add-on: "Save to Cookbook" Recipe Archiving + Diagram Audit

### What was built
- **`src/lib/recipeStore.ts`** — a tiny Solid store backed by `localStorage`
  (`nemzilla-studio:recipes`). `saveRecipe()` writes to `localStorage` *first* (so it's the
  immediate source of truth for `CookbookDropdown.tsx`'s display, no network dependency), then
  best-effort POSTs to the server for durable archival — a failed archive call is logged but
  doesn't block or roll back the local save, since losing the server copy still leaves the
  feature fully working from this browser.
- **`src/components/SaveRecipeModal.tsx`** — the `[ 💾 Save to Cookbook ]` button + form (Recipe
  Name, Description, Category Tag select). Mounted inside `AppPreview.tsx`'s header, gated behind
  `<Show when={sandbox.state.status === 'ready'}>` so it can't appear mid-build or on an error.
- **`src/server/services/recipeSerializer.ts`** + `POST /api/sessions/save-recipe`
  (`src/server/routes/sessions.ts`) — writes `.codex/demos/custom-[recipe-id].json`. The route
  handler validates everything server-side rather than trusting the POST body: `id` must match a
  strict UUID pattern (prevents path traversal via a crafted id, same defense already used for
  `loadSession()`), `category` must be one of the 3 literal allowed values (rejects anything else
  with 400), `name`/`description`/`code` are type- and length-capped.
- **`sessionSerializer.ts`** updated to skip `custom-*.json` in `listSavedSessions()` — without
  this, every saved recipe would also show up in the "AgentZ Cookbook (saved runs)" section
  (meant for auto-named completed builds), duplicating it under both dropdown sections.
- **`CookbookDropdown.tsx`** gained the "⭐ My Saved Recipes" section, rendered directly from
  `recipeState.recipes` (reactive, no fetch needed since it's already in the client-side store);
  clicking a recipe calls `sandboxStore.setCode(recipe.code)` for the same instant-replay behavior
  as saved runs.

### Diagram audit
Read `.codex/AGENTZ-STUDIO-SDK.md` fresh and checked for all 5 named diagrams — all present
(Top-Level Platform Layout §8, Dual-Engine Architecture, Governance Matrix §9, Merkle Chain §10,
Single-Active Builder Lock §11). While auditing, found and fixed two real issues:
1. **A duplicate diagram**, pre-existing since before UOW-06 — two near-identical copies of the
   Dual-Engine Architecture ASCII box sat back-to-back (the second just relabeled "Engine A:
   Synthetic / State" to "Engine A: Synthetic / State & Policy"). Removed the stale first copy,
   kept the more accurate second one.
2. **A stale claim in section 8** — UOW-09's version explicitly said the Command Drawer and
   AgentZ Bible buttons from the layout diagram "are not built," which became false the moment
   this same UOW built them. Updated the note and added section 13 documenting
   `CommandCenterDrawer.tsx`/`BibleModal.tsx`, plus extended section 12 with the recipe archiving
   feature.

### Verification
- `npx tsc -b` / `npm run build` / `npm run test:sse` all clean after the add-ons.
- Real `NODE_ENV=production` boot: `POST /api/sessions/save-recipe` returns `400` for an empty
  body and `200` + writes the correct `custom-[id].json` file for a valid payload.
- Playwright: confirmed the Save button appears only once a build reaches `ready`; filled and
  submitted the form; confirmed the recipe landed in `localStorage` (name/category/code all
  correct) *and* as a server-side `custom-*.json` file; opened the Cookbook dropdown and confirmed
  the new recipe appears under "⭐ My Saved Recipes" (distinct from "AgentZ Cookbook (saved
  runs)"); clicked it and confirmed instant replay (status stayed `ready` throughout, no
  re-triggered build animation). Zero console errors. Also caught and fixed a minor cosmetic
  wrap issue on the Save button's label in the constrained header row (`whitespace-nowrap`).

### Risk/Debt
- No delete/rename UI for saved recipes — `recipeStore.ts` only exposes `saveRecipe()`. Managing
  an unbounded, ever-growing `localStorage` list (or the matching `.codex/demos/custom-*.json`
  files) is left for a future UOW if it becomes a real problem.
- Recipe archival to the server has no retry — a failed POST (e.g. the server briefly
  unreachable) means that one recipe only exists in this browser's `localStorage`, with no
  automatic reconciliation later.
