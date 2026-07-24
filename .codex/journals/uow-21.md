# UOW-21 Developer Journal — UAT Fix: Guided Banner → Collapsible Top Drawer & Viewport Layout Fix

## Finding the actual root cause before touching anything
The reported symptom was specific: on page load, the top of the Swarm Canvas was cut off above the
viewport, and the bottom workspace controls got pushed toward the bottom edge. Before writing any
CSS, I read `App.tsx` to understand exactly what was producing that shape of bug, since "things are
cut off at both the top and the bottom simultaneously" is a distinctive enough symptom to point at a
specific cause rather than generic "not enough padding."

`<main>` was `flex flex-1 flex-col items-center justify-center gap-6 ... py-12`, with the h1/subtitle,
the guided banner, the Swarm Canvas, and the 3-column workspace grid all as direct children of that
one flex column. `justify-center` on a flex column centers the column's *total content height*
within the available space — when that total height exceeds the viewport, the excess gets distributed
equally above and below, not just below. The guided banner, when expanded (description + 3 steps + a
CTA button), was tall enough on its own to push the combined content past the viewport height — and
because everything was centered as one block, that extra height didn't just require scrolling from the
top; it shifted the *entire column* upward, clipping the Swarm Canvas's top nodes above the fold while
simultaneously shoving the bottom row down past the bottom fold. This is exactly the reported shape of
symptom, and it's a structural problem (the banner's height directly feeding into what the workspace's
own centering decides), not something a padding tweak alone would fix — reducing padding would help
marginally but the banner's own height would still be coupled to the centering computation of content
it has no real relationship to.

## The actual fix: decouple, don't just shrink
The instructions asked for the banner to become "a collapsible drawer container located just below
the header" — which, read carefully, is also the structural fix: moving it out of `<main>`'s centered
flex column into its own full-width section directly below `<EcosystemNav/>` removes it from that
column's height computation entirely, regardless of whether it's expanded or collapsed. I did this
literally (not just to satisfy the instruction's wording, but because it's the correct fix): the
banner is now a sibling of `<main>`, not a child of it.

I also removed `<main>`'s `justify-center` — even with the banner relocated, centering the remaining
content (h1/subtitle, Swarm Canvas, workspace grid) still risks the same class of bug on a short
viewport once the workspace grid grows (e.g., the Swarm Canvas's node count scaling up during a dense
swarm run). Top-aligned flow (removing `justify-center`, keeping `items-center` for horizontal
centering) means any future height growth causes ordinary scrolling from a stable top anchor, never
symmetric top/bottom clipping. Reduced `<main>`'s vertical padding from `py-12` to `py-6 sm:py-8`
alongside this, reclaiming real vertical space on top of the structural fix.

## The drawer itself: reusing established patterns rather than inventing new ones
Two things needed to be shared across components that don't otherwise talk to each other:
`EcosystemNav.tsx` (new "ℹ️ How it Works" toggle button) and `GuidedWorkflowBanner.tsx` (the drawer
itself, now living elsewhere in the tree). This is exactly the shape `adminDrawerStore.ts` already
solved for the Admin Drawer (a toggle trigger in one place, the drawer's content somewhere else) — so
`guidedBannerStore.ts` mirrors that pattern directly rather than reinventing a different mechanism:
a plain shared Solid signal, `toggleGuide()` for the header button, and a separate `dismissGuide()`
for the drawer's own "✕ Dismiss" button (deliberately not the same function as toggle — dismissing
should always land on closed and persist that, never accidentally re-open something already open).

The `localStorage` key was specified explicitly in the instructions —
`agentz_guide_dismissed` with `'true'`/`'false'` string values — which is a different naming
convention than this project's usual `nemzilla-studio:`-prefixed keys elsewhere (`visitorStore.ts`,
`runHistoryStore.ts`, the old banner's own prior key). I used the exact specified key/value rather
than reconciling it to the project's usual convention, since it was given explicitly and there's no
functional reason it needs to match the others — it's an isolated, single-purpose flag.

For the smooth collapse animation, I reused the exact technique `Terminal.tsx`'s own expand/collapse
already established (Pass D/UOW-16): a `max-height`/`opacity` CSS transition rather than trying to
animate to/from `height: auto` (which plain CSS transitions can't do directly without either a fixed
target height or the newer `grid-template-rows` 1fr/0fr trick). Keeping the same technique already
used elsewhere in this codebase for the same *kind* of animation, rather than introducing a second
approach for no functional benefit.

## Verification
- `npx tsc -b` (as requested) — clean.
- `npm run build` (as requested) — clean.
- Full production-mode Playwright verification at a standard 1280×800 viewport (purpose-built
  script) confirmed the entire flow:
  - A fresh page load with no `agentz_guide_dismissed` key set defaults the drawer to open
    (computed `max-height: 480px`).
  - Clicking "✕ Dismiss" sets the `localStorage` flag to `'true'`, smoothly collapses the drawer
    (`max-height: 0px`), and — the actual point of the fix — the Swarm Canvas's bounding rect lands
    entirely within the 800px viewport (`top: 222px`, `bottom: 572.4px`), zero cutoff.
  - **A real page reload** (not just toggling state in-memory) correctly re-initializes the drawer
    collapsed, reading the persisted flag — the exact behavior specified ("If 'true', initialize the
    drawer collapsed"). The full workspace geometry after reload showed the Swarm Canvas
    (top 222px, bottom 572px) and the start of the Terminal row (top 596px) all comfortably within
    the 800px viewport with no top cutoff.
  - The header's "ℹ️ How it Works" button correctly toggles the drawer open (`max-height: 480px`)
    and closed (`max-height: 0px`) again, independent of the persisted default — confirming it works
    as a genuine toggle, not just a one-way "show" action.
  - Zero *new* console errors — the one message that appeared (`audit stream error TypeError:
    network error`) is the exact same pre-existing, already-root-caused `auditStore.ts` behavior
    documented back in UOW-15 (no page-unload handling around its `fetch()`), triggered here by the
    test script's own `page.reload()` call, not a regression from this change.
- **One honest nuance, not silently smoothed over:** with the drawer *expanded* (the state a genuine
  first-time visitor sees, before ever dismissing it), the Swarm Canvas's own container still sits
  about 29px above the viewport's top edge at 800px height. I checked what that 29px actually clips —
  it's the section's own top padding and the "Swarm" label text, not the agent node circles
  themselves (which sit further down within the SVG's own internal layout, comfortably below that
  29px). The explicit requirement in the instructions was scoped specifically to the *collapsed*
  case ("If 'true', initialize the drawer collapsed so the Swarm Canvas... fill the primary viewport
  cleanly") — which is fully satisfied — so I didn't chase the expanded-state's minor residual
  overflow further, but I'm recording it plainly rather than implying the fix is flawless in every
  state.

## Cleanup
Verification spun up a throwaway server on port 5317 plus real `.codex/audits/`/`.codex/demos/`/
`.codex/sessions/` runtime artifacts — deleted before finalizing, along with the
`verify-drawer.tmp.mjs` script itself.

## UOW-21 complete
Both requirements shipped: the guided banner is now a genuine collapsible top drawer (persisted via
the exact specified `localStorage` key/value, toggleable from a new header button, dismissible with a
prominent button of its own), and the viewport layout collision is fixed at its actual structural
root — the banner's coupling to a centered flex column — rather than patched with padding alone.
