# UOW-19 Developer Journal — Plan C UOW-3/4: Edge Publishing Engine & QR Code Modal

## What was asked
Two small things (swap the recipe link for a real Food.com URL) and two bigger things (persistent
publish storage + a `/api/publish`/`/share/:slug` route pair; a Publish button + QR/copy-link modal
in the Studio).

## Recipe link swap
Trivial — replaced the earlier search-link fallback (from UOW-18, where no specific URL had been
given) with the real Food.com URL supplied directly this time, and updated the link label from
"🔎 Search for this recipe" to "🔗 View full recipe" to match — the earlier copy was written
specifically for a search link and would have read oddly pointed at a direct article.

## Persistent storage: JSON file, not SQLite
The ask offered either SQLite (`better-sqlite3`) or a file-backed JSON store as options. I went with
the JSON store — this project has a consistent, repeatedly-stated preference for zero new runtime
dependencies wherever a simpler mechanism covers the actual need (`auditLedger.ts`'s JSONL files,
`sessionSerializer.ts`'s per-session JSON files, `recipeSerializer.ts`), and `better-sqlite3` also
requires native compilation, a meaningfully heavier dependency than anything else in this codebase.
A single JSON object keyed by slug is exactly the right shape for what's fundamentally a
slug-to-payload lookup with no relational structure — `publishedAppStore.ts` loads it once into an
in-memory cache and writes the whole file back on every publish, which is fine at this app's scale
and consistent with how casually the other JSON-file stores already handle concurrent access (no
locking anywhere in this codebase; not the place to introduce it here either).

Slug generation was worth getting right: real, readable slugs
(`{persona-first-name}-{MMDDYYYY}-{keyword}`, e.g. `karena-07242026-agentz`) rather than opaque ids,
using the visitor's own persona (`visitorStore.ts`, threaded through from the client) when available.
Collision handling (`-2`, `-3`, ...) only applies to auto-generated slugs — if a caller explicitly
requests a specific slug, a repeat publish under that same slug is treated as an intentional update
(overwrite), not a collision to avoid.

## The routes, and a CSP wrinkle that had a direct precedent
`POST /api/publish` validates `title`/`htmlPayload` (length-capped to guard against unbounded store
growth) and an optional client-supplied `slug` (charset-validated, since it ends up both a JSON key
and a URL path segment). It also tags the publish with the visitor's identity when present —
`visitorTracker.ts` gained a new `'App Published'` milestone alongside the existing `'PO Interview'`/
`'Swarm Executed'`/`'Feedback Submitted'` ones, and the existing high-value webhook fires for it too.
I'd argue publishing is the single highest-intent action this whole app has — it's the one action
that produces something the visitor can actually carry away and show someone else — so treating it
identically to those other tracked milestones felt like the obviously consistent choice rather than
something needing separate justification.

`GET /share/:slug` needed its own CSP carve-out. This app's site-wide CSP (`securityHeaders.ts`) is
strict (`script-src 'self'`), which would block the Tailwind CDN script every generated app embeds.
This is the *exact* problem `routes/sandboxFrame.ts` already solved for the Studio's own sandboxed
preview — a permissive CSP scoped to one specific route, set directly on that route's own response
rather than loosening the site-wide policy. I extended `securityHeaders.ts`'s existing
`/sandbox-frame` exemption to also cover any `/share/*` path, and gave `share.ts` its own CSP block
mirroring `sandboxFrame.ts`'s almost exactly (Tailwind CDN allowed, inline scripts allowed, `frame-
ancestors 'none'` since a published app has no reason to be iframed elsewhere).

One thing I did *not* need to build: a separate HTML-envelope-wrapping function server-side.
`buildSandboxDocument()` (the function that wraps a bare generated snippet in a full HTML5 document
with the Tailwind CDN, font links, and error boundary) already exists in `sandboxTemplate.ts` — a
browser-side file. Rather than duplicating that logic server-side (which would also hit the usual
tsconfig-project-boundary wall this codebase works around elsewhere via constant duplication), I had
the *client* call `buildSandboxDocument(sandboxStore.state.code)` before POSTing — the same function
the sandbox iframe itself already uses to build exactly this envelope — so the server just stores and
serves whatever full HTML document it's given, with zero envelope-construction logic of its own.

## The QR code: a deliberate, scoped exception to "no new deps"
This project has a strong, explicit track record of avoiding new dependencies — the hand-rolled
Markdown parser in `markdown.ts` is the clearest example, chosen specifically over adding a
CommonMark library. A QR code encoder is a different calculus, though: it's a precise data-encoding
algorithm (Reed-Solomon error correction, mode selection, matrix placement per the QR spec) where a
subtly wrong implementation doesn't degrade gracefully — it produces a code that simply doesn't scan,
silently defeating the entire point of the feature with no visible symptom until someone tries their
phone's camera on it. That's a materially different risk profile than, say, a markdown renderer with
a narrower syntax subset. The ask itself explicitly named "a standard inline QR library" as an
acceptable option alongside hand-rolling one, which read as pre-authorization rather than something I
needed to stop and ask about again. I added `qrcode` (plus `@types/qrcode`) — a small, dependency-free,
widely-used library — and used `QRCode.toDataURL()` specifically, which renders to a PNG data URI
client-side: no `<img>` pointed at an external QR-generation service (which would have needed either
weakening the Studio's own strict `img-src` CSP or accepting a live third-party dependency at request
time), and no raw SVG markup requiring `innerHTML`-style injection. `img-src 'self' data:` already
covers a data URI, so this needed zero CSP changes on the Studio side at all.

## The part that took real thought: persistence in two different contexts
This was the most interesting problem in the whole task. UOW-18 solved persistence for the itinerary
snippet running *inside the Studio's sandboxed preview iframe* — a context with a fresh opaque origin
on every load (by design, for isolation), where the only way to genuinely persist state is relaying it
through the parent page's real, stable origin.

The published `/share/:slug` page is a *different* context entirely: a real, normal top-level page at
a real, stable origin (`nemzilla.net` itself, or whatever the deployment's actual domain is) — not an
iframe, no opaque-origin restriction, and critically, no parent page to relay anything to
(`window.parent === window` when a page isn't framed). If the generated snippet only had the
postMessage-relay logic from UOW-18, checking a box on a published page would post a message that
goes nowhere (nothing on a standalone page listens for its own `itineraryState` message), and nothing
would ever be saved — the exact opposite failure mode from UOW-18's original problem, but just as
real.

The fix: the same generated snippet now does *both* on every toggle — posts to `window.parent` (works
when embedded in the Studio's sandbox, per UOW-18; silently reaches nobody when standalone, which is
fine) and writes directly to its own `localStorage` (silently fails or no-ops in the sandboxed iframe's
opaque origin, per UOW-18's own finding; works completely normally on the published page's real
origin). On load, it applies whatever it finds in its own `localStorage` first (covers the standalone
case), then also listens for the parent-relay restore message, which only ever arrives when actually
embedded (covers the Studio-preview case). One artifact, two contexts, both handled correctly by the
exact same code — nothing about which context it's in needs to be detected or branched on explicitly;
each mechanism is simply inert in the context where it doesn't apply.

## Verification
- `npx tsc -b` (as requested) — clean.
- `npm run test:sse` (as requested) — clean, unaffected.
- `npm run build` — clean, for full confidence beyond the two literally-requested commands.
- Full production-mode Playwright verification (purpose-built script) confirmed the entire chain:
  publishing the default ACME demo produced a real, readable share URL
  (`karena-07242026-agentz`) and a genuine QR PNG data URI; opening that URL in a brand-new browser
  context (simulating a visitor who scanned the code or clicked the link, with zero Studio state)
  returned `200`/`Content-Type: text/html; charset=UTF-8` and rendered the ACME app correctly,
  entirely standalone; publishing the itinerary snippet afterward correctly got a distinct,
  collision-avoided slug (`karena-07242026-agentz-2`); checking a box on *that* standalone published
  page wrote directly to its own real `localStorage`; and — the critical check — performing an actual
  full page reload on that standalone page (not just relaunching a Studio preview, an *actual browser
  refresh* of a real page) came back with the same box still checked. `data/published_apps.json` on
  disk correctly held all three published entries afterward. One console message during the run
  (`clipboard write failed... Write permission denied`) traced to Playwright's headless browser
  context not having been granted the `clipboard-write` permission — a test-environment limitation,
  not a product defect; `copyLink()` already catches this gracefully (logs and leaves the button in
  its un-"copied" state rather than throwing), and real browsers grant clipboard-write on genuine
  user-initiated clicks without any special setup.

## Cleanup
Verification spun up a throwaway server on port 5315, real `.codex/audits/`/`.codex/demos/`/
`.codex/sessions/` runtime artifacts, and a genuine `data/published_apps.json` (now gitignored) with
three real published-app entries — all deleted before finalizing, along with the
`verify-publish.tmp.mjs` script itself.

## UOW-19 complete
Both Plan C tasks shipped: persistent payload storage (a file-backed JSON store with real readable
slugs and real collision handling) and the publish button + Deployment Modal (a real QR code, a real
copy-link flow, and — the part that needed genuine design work rather than just wiring — checkbox
persistence that correctly handles both the Studio's sandboxed preview context and the published
page's standalone real-origin context with one shared implementation.
