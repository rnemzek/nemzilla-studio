# UOW-20 Developer Journal — UAT Fixes: Sticky Nav, Onboarding CTA & AI PO Domain-Locking Bug

## What was asked
Three UAT-reported issues: the header should stay visible while scrolling; the onboarding banner
needs a clear "start here" call-to-action; and — the critical one — the AI PO was steering every
conversation toward order-entry regardless of what the visitor actually asked for.

## Sticky navigation — caught a stacking-context mistake before it shipped
The literal instruction was `sticky top-0 z-50`. Before applying that verbatim, I grepped every
existing modal/drawer's own z-index (`AdminDrawer.tsx`, `CommandCenterDrawer.tsx`, `BibleModal.tsx`,
`FeedbackModal.tsx`, `PublishModal.tsx`, `SaveRecipeModal.tsx`) and found they all use `z-30`
(backdrop) / `z-40` (panel/dialog content). A `z-50` header would sit *above* every one of those —
meaning the sticky header would render on top of any open modal or drawer, visually broken the
moment a visitor scrolled while, say, the Feedback modal was open. Used `z-20` instead: high enough
to stay above ordinary scrolling page content (which has no explicit z-index), low enough to stay
correctly beneath every existing overlay layer. Small thing, but exactly the kind of detail that's
invisible until someone actually opens a modal and scrolls — worth checking against existing usage
rather than typing the number from the request literally.

## Onboarding CTA — no new store needed
`GuidedWorkflowBanner.tsx` and `Terminal.tsx` are sibling components with no existing shared state for
"where's the prompt input." The straightforward option would be a new store (this codebase has
several small ones — `adminDrawerStore.ts`, `templateStore.ts` — for exactly this kind of
cross-component coordination), but those exist because they hold *ongoing* reactive state something
else needs to read continuously. This is a one-shot imperative action: click a button, focus an
element, scroll to it, done — there's nothing to keep in sync afterward. A plain
`document.querySelector('[data-testid="terminal"] textarea')` (the same `data-testid` `Terminal.tsx`
already exposes) is the right-sized tool here; introducing a store for a single fire-and-forget DOM
interaction would be the over-engineering this project's conventions explicitly warn against.

One detail worth calling out: `.focus({ preventScroll: true })` is called *before*
`.scrollIntoView({ behavior: 'smooth' })`, not after. Browsers scroll a newly-focused element into
view by default unless told not to — without `preventScroll`, that default jump and my own smooth
scroll would fight each other (an instant jump immediately followed by an animated one, or vice
versa, depending on timing). Suppressing the browser's own scroll and driving it entirely through my
own explicit `scrollIntoView` call gives one clean, predictable animation instead of two competing
ones.

## The domain-locking bug — this was the real work
Reproducing the report first: I ran the actual reported input ("Lets make my to-do list for the
day?") against the *unmodified* code via a real Anthropic call before touching anything, to see the
bug firsthand rather than guessing at the cause from the report alone. It reproduced exactly as
described.

Tracing it back led directly to Pass E (UOW-17), and specifically to a design assumption I'd made
there that didn't hold up under actual use: I'd assumed a visitor would explicitly pick a domain via
`/template <id>` *before* starting a conversation, and built the system-prompt overlay mechanism
around that assumption. In practice, nobody does that — people just type what they want built. The
"active template" signal still defaults to `'order-entry'` from the moment the page loads (by
design, so the Swarm Canvas and App Preview have something sensible to show before any real
interaction happens), and `poInterview.ts` was unconditionally reading that same default signal and
sending it as `templateId` on *every single interview turn*, triggering the `'order-entry'`
template's overlay ("keep the discovery centered on a vendor/company name, a product catalog with
prices...") regardless of whether the visitor had ever touched `/template` or asked for anything
resembling an order-entry system.

That's one half of the bug. The other half compounds it: `poInterviewLLM.ts`'s base `SYSTEM_PROMPT`
— the prompt every interview gets *regardless* of any overlay — opened with "...conducting a short,
friendly discovery interview to gather what's needed to build a small order-entry web app." Even with
the overlay bug fixed, this base framing alone would have kept nudging the model toward order-entry
vocabulary for a to-do-list request, just less forcefully. Both needed fixing for the reported
behavior to actually go away, not just to become slightly less pronounced.

**Fix 1 — gate the overlay behind explicit intent.** Added `templateExplicitlySet`, a signal in
`templateStore.ts` defaulting to `false` and flipped to `true` only inside `setActiveTemplate()` —
the one function `/template <id>` calls. `poInterview.ts` now only includes `templateId` in the
request body when this is `true`; otherwise it's `undefined`, and the server-side handler (already
written defensively — `typeof templateId === 'string' ? ... : undefined`) applies no overlay at all.
A visitor who never runs `/template` gets the AI PO's own unmediated judgment. A visitor who *does*
run `/template wfd` still gets that domain's overlay exactly as Pass E designed. The Swarm Canvas's
idle-preview persona nodes and App Preview's domain badge deliberately still default to showing
`'order-entry'` — that's a cosmetic default with no bearing on the actual conversation, and changing
it wasn't asked for or necessary to fix the reported behavior.

**Fix 2 — make the base prompt itself domain-neutral.** Rewrote `SYSTEM_PROMPT` to explicitly
instruct the model to read the visitor's own words and adopt whatever vocabulary actually fits (to-do
list, dinner plan, itinerary, order entry, or anything else), with a concrete counter-example inline
("if someone says 'let's make my to-do list for the day,' ask about tasks and a schedule, not a
vendor and a product catalog"). Deliberately did **not** change the underlying extracted field names
(`vendorName`/`catalog`/`hitlThreshold`) or the structured-output schema — that's the one contract the
downstream swarm-build/synthesizer pipeline depends on, and forking it per domain would be a
materially larger change than fixing a prompt-framing bug (the same scope boundary I'd already noted
in `templateRegistry.ts`'s own overlay doc comment during Pass E). The fix is entirely at the
instruction level: the same three fields, described in neutral terms, with an explicit directive not
to default to business/order framing.

## Verification
- `npx tsc -b` (as requested) — clean.
- `npm run build` — clean.
- `npm run test:sse` — clean, unaffected (no server streaming contract changes).
- Full production-mode Playwright verification (purpose-built script) confirmed all three fixes:
  - The header's computed CSS `position` is `sticky`, and its bounding-rect `top` stays within a few
    pixels of `0` after scrolling the page 800px down.
  - Clicking "🚀 Click here to blast off!" both moves focus to the real prompt textarea
    (`document.activeElement === input`) and brings it into the viewport
    (`getBoundingClientRect().top` within the visible window) — both true after the click.
  - The critical check: sending "Lets make my to-do list for the day?" with **no** `/template`
    command ever run in that session produced the AI PO reply *"Great! I'd love to help you build a
    to-do list app. What's the name of your day or the main thing you're planning for — like 'Monday'
    or 'Grocery Run' or something else?"* — a real, billed Anthropic API call, not a mock, reproducing
    the exact input from the bug report and confirming it no longer steers toward order-entry. A
    regex check against the reply for order-entry/vendor/catalog language came back negative.
  - Zero console errors throughout.

## Cleanup
Verification spun up a throwaway server on port 5316 plus real `.codex/audits/`/`.codex/demos/`/
`.codex/sessions/` runtime artifacts — deleted before finalizing, along with the
`verify-uat.tmp.mjs` script itself.

## UOW-20 complete
All three UAT issues fixed: sticky navigation (with a z-index stacking mistake caught before it
shipped), the onboarding "blast off" CTA, and — the one that mattered most — the AI PO
domain-locking bug, traced to its actual root cause across two compounding pieces of Pass E's own
design rather than patched at the surface (e.g. by special-casing "to-do list" as a keyword, which
would have fixed this one reported phrase while leaving the same overlay-injection bug ready to
misfire on the next unanticipated request).
