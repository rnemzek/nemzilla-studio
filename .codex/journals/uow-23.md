# UOW-23 Developer Journal — Executive Product Showcase Overlay / Drawer

## What this actually needed to be
Every prior UOW in this project has been aimed at making the platform's technical behavior work
correctly for someone who's already decided to poke at it. This one is different in kind: the
audience is a non-technical hiring manager or product owner who lands on the page cold, and the job
of this modal is to answer "what is this and why should I care" in about ten seconds before they ever
see a terminal, a swarm canvas, or an audit ledger — all of which read as "engineering demo," not
"product." So the actual design constraint wasn't just "build a modal with these bullets," it was:
make sure this modal is the very first thing a first-time visitor sees, make it trivially dismissible
so it never becomes an annoyance to a returning visitor, and don't let it get in the way of the two
outcomes a visitor might want (jump into the live workspace, or go read the resume).

## Reusing established patterns rather than inventing new ones
Two shared-state patterns already exist in this codebase for exactly this shape of problem — a
header button that needs to control a signal read by a completely separate, elsewhere-mounted
component: `adminDrawerStore.ts` (Admin Drawer) and `guidedBannerStore.ts` (the guided banner drawer
from UOW-21). `executiveShowcaseStore.ts` follows the same shape rather than reinventing one: a plain
Solid signal, a `localStorage`-backed default computed once at module init, and named functions
(`openExecutiveShowcase()`, `dismissExecutiveShowcase()`) rather than exposing the raw setter.

The modal itself (`ExecutiveShowcaseModal.tsx`) reuses the exact backdrop/card shape every other
modal in this app already uses — `fixed inset-0 z-30` backdrop with `bg-black/60`-family overlay,
`onClick` on the backdrop dismissing while `event.stopPropagation()` on the card prevents a click
inside the card from bubbling up and closing it. This is the same pattern `BibleModal.tsx`,
`FeedbackModal.tsx`, `PublishModal.tsx`, and `SaveRecipeModal.tsx` all already use, so this modal
doesn't introduce a fourth slightly-different modal convention into the app.

## The "seen" flag: two paths write it, one path deliberately doesn't
The spec named exactly one thing that writes the flag ("🚀 Launch Live Workspace... sets
agentz_executive_seen = 'true'"), but a real modal needs a real close affordance too (every other
modal in this app has a "✕"), and I had to decide what that "✕" does to the flag. I decided both
"Launch Live Workspace" and the "✕"/backdrop-click write the flag — because from the product's
perspective, both represent "the visitor has now seen the pitch and moved on," and only the *header's*
manual reopen (`openExecutiveShowcase()`) leaves the flag untouched. The alternative — only "Launch"
writes the flag, and closing via "✕" doesn't — would mean a visitor who reads the pitch and closes it
via "✕" (a completely normal thing to do) gets nagged with the same modal again on their very next
visit, which defeats the entire point of a "seen" flag. I recorded this as a deliberate interpretation
rather than silently picking one, the same way this project has handled ambiguous specs before (e.g.
UOW-20's `z-50`→`z-30` correction).

The header's "⚡ Executive Summary" button, by contrast, must NOT touch the flag either way — it's a
manual, on-demand reopen, and if it set the flag to `false` every time (to make sense of "showing the
modal again"), that would make a visitor's own future fresh visits keep re-showing the modal even
though they explicitly already saw the product; if it left the flag alone but the *store's open
signal* were the only source of truth checked at some later reload, that's also fine as designed —
`showcaseOpen()`'s initial value is only ever computed once, at module load, from the persisted flag,
so a manually-reopened-then-manually-closed modal in the current session has zero effect on a future
page load's default state either way. This was worth being precise about because it's exactly the kind
of behavior that "looks the same" in a quick manual check but differs on the one path
(fresh-load-after-manual-use) that's easy to not think to test.

## The resume link: reusing a real destination instead of guessing one
"View Resume / Architecture Spec" needed a real destination, and I don't invent URLs. I found
`terminalCommands.ts`'s existing `LAUNCH_TARGETS.robert = 'https://robert.nemzilla.net'` — the
`/launch robert` slash command already resolves to this, so it's an established, real, already-in-use
destination for exactly this purpose (the person behind this project's own portfolio site), not a
guess. I reused it directly rather than fabricating something new. The button opens it in a new tab
(`target="_blank" rel="noopener noreferrer"`, the same external-link security pattern `BibleModal.tsx`
already uses for links inside the Bible content) and deliberately does NOT dismiss the modal — a
recruiter who clicks through to read the resume in a new tab shouldn't lose their place in the pitch
they were still reading in the original tab.

I considered whether this button should instead open the in-app `BibleModal` (which already serves
`.codex/AGENTZ-STUDIO-SDK.md` as the "architecture spec" half of the button's label), but decided
against stacking a second modal on top of this one or replacing this modal's content with the Bible's
— that would be a more invasive change to an already-working component for a corner the spec's wording
only weakly implies, versus a single, real, already-established external link that unambiguously
covers "resume."

## Verification
- `npx tsc -b` (as requested) — clean.
- `npm run build` (as requested) — clean.
- Full production-mode Playwright pass (this project's standing convention for anything with real
  runtime behavior, not just types):
  - A genuinely fresh visitor (no `localStorage` flag) sees the modal auto-open on load, with the
    headline text matching the spec exactly and all three value-prop bullets present by title.
  - The resume link's `href`/`target` are correct, and simply having it on screen doesn't close the
    modal (confirming the earlier click-outside/stopPropagation wiring doesn't over-fire).
  - Before any dismissal, `agentz_executive_seen` is genuinely unset (`null`) — not defaulted to some
    other falsy string that would silently pass a loose check.
  - Clicking "🚀 Launch Live Workspace" dismisses the modal and sets the flag to the exact string
    `'true'`.
  - **A real page reload** with the flag now set correctly does NOT re-show the modal — the actual
    point of the default-visibility requirement, verified with a real navigation, not just inspecting
    the signal's initial value in isolation.
  - The header's "⚡ Executive Summary" button reopens the modal on demand, and doing so does not
    alter the persisted flag (still `'true'` afterward) — confirming the asymmetry described above
    actually holds at runtime, not just in the code's intent.
  - The "✕" button also dismisses cleanly.
  - Zero new console errors — the one message seen (`audit stream error TypeError: network error`) is
    the same pre-existing, already-documented `auditStore.ts` reload artifact from UOW-15/21/22, not
    a regression.

## Cleanup
Deleted the throwaway verification script (`scripts/verify-uow23.tmp.mjs`), killed the throwaway
port-5321 server, and removed the runtime artifacts it generated (`.codex/audits`, `.codex/demos`,
`.codex/sessions`, `.codex/feedback`, `data/`).

## UOW-23 complete
The executive pitch now shows automatically to first-time visitors before anything else, persists a
"seen" flag through the two paths that represent genuinely having seen it (Launch, close), stays
reachable at any time via a new header button that doesn't disturb that persisted state, and its
resume link points at a real, already-established destination rather than a fabricated one — all
verified live against a real running server, not just compiled.
