# UOW-18 Developer Journal — Plan C Kickstart: Unified Itinerary Synthesizer

## What was asked, and a scope note up front
The chat instructions asked for four concrete things: a schema file, a synthesizer function
producing a 3-section HTML snippet, real localStorage persistence for checkbox state, and a
branding pass. Separately, `.codex/AGENTZ-STUDIO-SDK.md` already had a much larger "Plan C"
architecture spec written directly into it before I started this UOW — "Unified Itinerary & Live App
Publishing Engine," including edge-publishing a generated app to a persistent `agentz.nemzilla.net/
share/:slug` URL with a QR code, and a "Conversational Dry Erase" model where the AI PO edits a
published payload live via chat. An untracked `.codex/gemini-rehydrate-context-block-07242026.md`
file appeared alongside it, strongly suggesting this was drafted in a separate Gemini planning
session run in parallel, not something to be confused about or revert.

This journal (and the UOW-18 tracker entry) is scoped to exactly what the chat message asked for —
the schema, the synthesizer, the persistence mechanism, and branding. The edge-publishing/QR/slug
infrastructure from the larger doc is explicitly **not** built here, and I said so directly in both
the tracker and the SDK doc itself, rather than letting the larger spec's presence imply more was
done than actually was.

## Schema: matching the doc instead of inventing a new shape
The chat message described the schema loosely ("supporting tasks, locations, recipe checklists, and
streaming providers"). The SDK doc already had a complete, thought-through `UnifiedItineraryPayload`/
`ItineraryTask` interface for exactly this concept — a single `category: 'errand' | 'culinary' |
'entertainment'` discriminator with a nested `details` bag (`checklist`, `externalUrl`,
`streamingProvider`, `notes`) covering all three domains through one shape. Since this is clearly the
same design lineage the user has already committed to in writing, I built `src/types/itinerary.ts` to
match it field-for-field rather than inventing my own divergent structure — using two different
schemas for the "same" concept across two documents would fragment the design for no reason. The one
small judgment call: the doc's `streamingProvider` is a singular string, while the chat message said
"streaming providers" (plural). I kept the doc's singular field but let its value be a display string
that can list multiple providers ("MASN, YouTube TV") rather than forking the type — a minor
refinement, not a divergence.

## The synthesizer replaces the old static snippet in place
`appGeneratorPrompt.ts` already had a `'today-itinerary'` scenario (`matchScenario()` routes prompts
containing "itinerary"/"today" to it — matching the Cookbook preset's "My TODAY Itinerary" prompt and
`templateRegistry.ts`'s `itinerary` domain template's `previewPrompt`). Rather than inventing a new
scenario id, I replaced the old `TODAY_ITINERARY_SNIPPET` static const with
`buildUnifiedItinerarySnippet(payload)`, a real function, under the exact same scenario id — this *is*
what "My TODAY Itinerary" should now mean, per the instruction to merge errands/recipe/entertainment
into the itinerary domain specifically. No other file needed to change to pick this up:
`templateRegistry.ts`'s `previewScenario: 'today-itinerary'` and `AppPreview.tsx`'s "Preview this
domain" button both already route through `matchScenario()` unchanged.

One deliberate choice: the old snippet had three live fetches (MLB, TheMealDB, Open-Meteo). I kept
the MLB fetch (real game matchup/time, feeding the entertainment banner) and dropped the other two —
TheMealDB because the new recipe section is a curated card, not a live-fetched recipe, and Open-Meteo
because weather isn't part of the requested 3-section structure. This keeps one genuine live-API
integration (matching the domain's original "Hybrid API + Rules Focus" positioning) without stretching
to force live fetches into sections the request didn't ask for.

## Why the recipe link is a search URL, not a specific article
The task named "Paula Deen Pecan Chicken Salad" but never provided an actual URL, and I'd already
asked once in the prior WFD-outline conversation without getting one. TheMealDB — the only live
recipe API already integrated anywhere in this codebase — is a generic, user-submitted database, not
celebrity-chef-branded content, so even a live "search for this dish" API call would never actually
return this specific recipe; faking a match would be worse than admitting the gap. I don't guess or
fabricate URLs for exactly this reason (a wrong specific link reads as more confidently "real" than an
honest search link, and is more likely to be silently broken or point somewhere unintended). The
`externalUrl` is a real, always-working Google search query for the dish name — clearly what it is,
not dressed up as a verified specific source.

## The persistence requirement exposed a real architectural constraint
This was the most interesting part of the task. The literal instruction — "the generated iframe JS
saves checkbox toggles to browser localStorage so checked items persist across page refreshes" —
can't actually be satisfied as stated, and I want to record precisely why, since it's a non-obvious
consequence of a security decision made much earlier in this project (UOW-06/UOW-07's sandbox
isolation work).

`src/server/routes/sandboxFrame.ts`'s iframe is embedded with `sandbox="allow-scripts"` and
deliberately **omits** `allow-same-origin` — documented explicitly (§5 of the SDK bible, and in
`sandboxStore.ts`'s own comments) as "to prevent generated payloads from accessing host site cookies
or parent storage." What I hadn't seen spelled out anywhere in this codebase before, but is a direct
consequence of that same HTML sandboxing spec behavior: omitting `allow-same-origin` doesn't just
block access to the *parent's* storage — it means the sandboxed document itself gets treated as
coming from a **fresh, unique, opaque origin every single time it loads**. `localStorage` written
inside that document during one load is tied to that load's own one-time opaque origin; the next
time this same generated app is rendered (a page refresh, a fresh `/template` + "Preview this domain"
click, anything that reloads the iframe), it gets a *different* opaque origin, and the earlier
storage is unreachable — not merely inconvenient to reach, but genuinely gone. So implementing the
literal instruction (`localStorage.setItem` inside the generated snippet's own script) would compile,
run without errors, and simply not do what "persists across page refreshes" promises.

Two ways out: weaken the sandbox by adding `allow-same-origin` (which — combined with
`allow-scripts` on a same-origin route — would hand the generated app's script real access to the
actual host site's cookies and storage, exactly what the sandbox exists to prevent), or route the
state through the parent, which already has a real, stable origin and already does exactly this for
order decisions (`SANDBOX_MESSAGE.order` → `sandboxStore.ts`'s `relayOrderEvent`). I chose the second,
adding two new message types (`itineraryState`, `restoreItineraryState`) that mirror that existing
pattern precisely: the child posts its full checkbox-completion map to the parent on every toggle;
the parent persists it to *its own* `localStorage` (a key scoped to this feature, not shared with
anything else) and, once the child confirms `rendered` on any future load, posts it back so the
child can re-check the right boxes. This delivers the actual feature requested — checked items
surviving a refresh — without touching the sandbox's security posture at all.

I flagged this in the SDK doc and both journal/tracker entries rather than either quietly implementing
something that looked right but didn't work, or quietly changing a deliberate security boundary
without calling it out.

## A bug that `tsc --noEmit` alone couldn't have caught
While writing the synthesizer's generated `<script>` block, one of my code comments used a backtick
inside a phrase: `` `rendered` (see sandboxStore.ts) ``. The entire return value of
`buildUnifiedItinerarySnippet()` is itself a backtick-delimited JS template literal in the *outer*
TypeScript file — an unescaped backtick anywhere inside it terminates that outer literal early,
silently truncating the string and leaving whatever comes after it to be mis-parsed as regular
TypeScript source.

This is exactly the kind of error `npx tsc --noEmit` (the literal command requested) does not catch
here: this project's root `tsconfig.json` has an empty `files` array and does all its real checking
through two project references (`tsconfig.app.json`, `tsconfig.node.json`). A bare `tsc --noEmit`
invocation against the root config checks nothing at all and reports a clean pass regardless of what's
actually wrong — a false green I'd already learned to route around in Pass E (documented in that
UOW's journal) but is worth restating here since it bit a real change this time, not just a
hypothetical. `npx tsc -b` (the project-references build mode `npm run build` actually runs) caught
the syntax error immediately and pointed at the right line. Fixed by rewording the comment to avoid
the backtick entirely. Both `tsc --noEmit` and `tsc -b` get run for every verification claim in this
project now, not just whichever one a request happens to name literally.

## Verification
- `npx tsc --noEmit` — clean (as requested, though see above re: what this command actually checks
  here).
- `npx tsc -b` — clean after the backtick fix (caught the real error the first time).
- `npm run build` — clean.
- `npm run test:sse` — clean, unaffected.
- Full production-mode Playwright verification (purpose-built script): switched to the `itinerary`
  template, clicked "Preview this domain" (with an extra buffer after the boot demo's own "ready"
  state, since the classic pipeline's builder lock can still be releasing for a beat after the iframe
  first renders — a fresh `connectGenerator()` call during that window would spectate the still-active
  original session instead of claiming a new build, which is exactly what happened on my first
  verification attempt and pointed me at the fix), and confirmed: the synthesized title reads
  "✨ My TODAY Itinerary"; the errand section shows 2 checkable tasks; the recipe card shows "Paula
  Deen Pecan Chicken Salad" with a working search link and 7 real ingredients; the entertainment
  banner shows a genuinely live-fetched MLB matchup ("San Diego Padres @ Atlanta Braves") alongside
  the synthetic streaming-provider text; checking an errand box and an ingredient box correctly wrote
  both into the *parent* page's `localStorage`; and — the critical check — relaunching the exact same
  preview came back with both of those same boxes already checked, proving the parent-relay
  persistence mechanism genuinely works end-to-end rather than being wiring that merely compiles.
  Zero console errors throughout.

## Cleanup
Verification spun up a throwaway server on port 5314 plus real `.codex/audits/`/`.codex/demos/`/
`.codex/sessions/` runtime artifacts — all deleted before finalizing, along with the
`verify-itinerary.tmp.mjs` script itself. Left `.codex/gemini-rehydrate-context-block-07242026.md`
completely untouched — it's the user's own external-tool planning artifact, not mine to read into,
alter, or clean up.

## UOW-18 complete
All 4 requested tasks shipped: the schema file (matching the already-drafted Plan C spec rather than
diverging from it), the synthesizer engine producing the real 3-section merged snippet, genuine
cross-refresh checkbox persistence via a parent-relay mechanism that respects the sandbox's existing
security boundary instead of weakening it, and the branding pass — plus a real syntax bug caught by
running the build's actual check mode rather than trusting a no-op `tsc --noEmit` alone.
