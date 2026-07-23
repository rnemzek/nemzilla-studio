# UOW-15 Developer Journal — Brand Avatar Contrast & Swarm Canvas Badge Positioning Fix

## What was asked
Screenshot feedback: the `RN` badge (header, CLI, Swarm Canvas nodes) needed bold black text on a
vibrant orange gradient with a crisp border instead of the old flat-orange/white-text version, and
the Swarm Canvas's floating `RN` node badges were visibly clumping/double-stacking (called out
specifically under the Reviewer node) instead of sitting cleanly at each node's own corner.

## Part 1: Brand avatar contrast
Straightforward — `src/components/RnAvatar.tsx` is the single shared component used by the header
(`EcosystemNav.tsx`), every PO chat line (`Terminal.tsx`), and every Swarm node badge
(`SwarmCanvas.tsx`), so fixing it once fixes all three call sites. Replaced the flat `#f97316` circle
fill with an SVG `<linearGradient>` (`#ff4500` → `#ff8c00` → `#ffa500`, diagonal) and switched the
text fill from white to black (`#000000`, weight 800, unchanged), plus a `#000000` stroke at width
2.5 (the circle radius was reduced from 32 to 30 to leave room for the stroke inside the 64×64
viewBox without clipping). Since this component can render many times on one page simultaneously
(up to 8 Swarm nodes plus the header plus however many PO lines are in the transcript), each instance
mints its own `<linearGradient>` id rather than reusing one literal string — SVG/HTML ids are
document-global, and while browsers happen to tolerate duplicate ids in practice, it's not something
to rely on with this many instances on screen at once. Updated the two static SVG files
(`public/rn-avatar.svg`, `public/favicon.svg`) to match, since they exist specifically to mirror this
design for contexts that need a real file rather than an inline component.

## Part 2: the badge "clumping" — a real bug, not a styling issue
My first hypothesis, before touching anything, was a z-order problem: each node's `RnAvatar` badge
was rendered *inside* that node's own `<g>`, interleaved in DOM order with every other node — so in a
dense layout (6-8 nodes, smaller radius, tighter spacing), a badge positioned near the edge of node N
could fall inside where node N+1's own opaque circle gets painted, and since SVG paints strictly in
DOM order, node N+1's circle (drawn later) would visually cover node N's badge. I fixed that by
moving badge rendering into its own dedicated `<For>` pass *after* all nodes render, guaranteeing
every badge always paints on top regardless of spacing, and switched the corner offset from an
approximated `radius * 0.72` multiplier to the exact trig value (`radius * Math.SQRT1_2`) so the
badge sits precisely on the circle's edge at a true 45° regardless of node size, plus added
`pointer-events-none` so the badge (now a separate top-level element covering part of the node
circle) can't intercept the hover events the node's own `<g>` registers for Replay Mode's Packet
Inspector.

That fix shipped, rebuilt cleanly, and I moved on to visual verification via Playwright screenshots
against a freshly-built production server — and the exact same clumping was still there, immediately,
even on a completely untouched fresh page load with zero CLI interaction. So the z-order theory was
wrong, or at best incomplete. I zoomed into the screenshots (Python/Pillow crop + upscale, since the
badges are small) and confirmed it wasn't an antialiasing/blur illusion: there were genuinely 2-3
fully-rendered, distinct "RN" circles stacked near the Reviewer/Lead Dev nodes.

To find the actual cause I stopped trusting screenshots and read the DOM directly via
`page.evaluate()` — first counting badge elements and their `getBoundingClientRect()` positions
across several seconds of the fresh boot demo, which showed the badge *count* correctly matched the
node count (no literal duplication in the `stageOrder` array — that theory was also ruled out), but
several badges' *positions* were clustered together despite their corresponding nodes being clearly,
visibly separated in the same screenshots. I then read the raw SVG attribute values (`cx`/`cy` on the
node circles' `<text>` labels vs. `x`/`y` on the badges) directly, which made the pattern
unambiguous: badge #1 (Planner) tracked its node correctly, but badges #2-4 (meant for Architect,
Lead Dev, Reviewer) were all sitting near *Reviewer's* actual position — the visually rightmost,
most-recently-added node — regardless of which agent they were nominally attached to.

That specific pattern — every badge frozen near "whatever was rightmost" — was the clue. Rethinking
`computeAnchors()`: it evenly spaces `order.length` anchors across a fixed width, so the *rightmost*
anchor's `x` is always `LAYOUT_MARGIN + usableWidth`, a constant, regardless of how many nodes are
in the layout. And a node is always the last element of `order` the moment it's freshly added — i.e.,
every node spends its very first instant on-canvas as the rightmost node in whatever `n`-node layout
is current *at that moment*, before the force layout animates it toward its final resting anchor as
more nodes join and anchors get recomputed. If a badge's position were somehow "frozen" rather than
tracking its node's live, animated position, every badge would end up frozen at approximately that
same constant rightmost `x` — exactly what I was seeing.

That reframed the question from "why do positions collide" to "why would a reactive value freeze,"
and the answer was immediate once I looked at `RnAvatar.tsx` itself:

```ts
export default function RnAvatar(props: RnAvatarProps) {
  const { size, ...rest } = props  // <-- breaks reactivity
  ...
  <svg ... {...rest}>
```

This is a well-known SolidJS pitfall: Solid components run their function body **once**, at mount —
unlike React, there's no re-render to "pick up" a new value on a later pass. Reactivity works because
`props` is a special object with per-field *getters*; reading `props.x` **inside** a tracked JSX
expression re-evaluates that getter every time its dependency changes. But `const { size, ...rest } =
props` is a plain object destructure — it *calls* every getter immediately, once, and bakes the
resulting plain values into `rest` forever. Every prop in `rest` (`x`, `y`, `width`, `height`,
`class`) was therefore captured at whatever value it happened to be the instant that specific
`RnAvatar` first mounted, and never updated again — even though `SwarmCanvas.tsx` passes freshly
computed `x`/`y` expressions that the force-layout simulation updates on every animation frame.

The fix is `splitProps` — Solid's purpose-built alternative that splits a props object into groups
while preserving the underlying getters:

```ts
const [local, rest] = splitProps(props, ['size'])
...
<svg ... width={local.size ?? 24} ... {...rest}>
```

This was a **pre-existing bug**, not something introduced by any of the recent passes — it's been
present since the very first commit that introduced `RnAvatar.tsx` (the "customize UI with RN brand
avatar" commit, well before this session). It just happened to be invisible/easy to miss in casual
use because a *static* badge (one that never needs to move again after mounting) would look correct
regardless of whether its props stay reactive — the bug only becomes visible for a prop that's
supposed to keep changing after mount, which is exactly what the Swarm Canvas's animated force layout
does to every node badge.

## Verification
- `npx tsc -b` / `npm run build` — clean, both before and after the `splitProps` fix (the earlier,
  incomplete z-order/trig fix also built clean, which is exactly why screenshots — not just
  compilation — were necessary to catch this).
- `npm run test:sse` — clean, unaffected (purely a client-side rendering fix).
- Direct before/after comparison via raw SVG attribute dumps (not just screenshots): before the fix,
  3 of 4 badges in the default boot demo clustered within ~20 SVG units of each other despite their
  nodes being clearly separated (Planner/Architect/Lead Dev/Reviewer at x≈60/180/300/420 in viewBox
  units); after the fix, every badge's offset from its own node is consistent (~13 units, matching
  `radius * Math.SQRT1_2 - badgeSize/2` for radius=30, badgeSize=16) and stable across repeated
  captures.
- Screenshots of the header badge (bold black "RN" on the orange gradient with a crisp border) and
  the Swarm Canvas (four nodes, each with exactly one correctly-anchored badge, no clumping) both
  confirmed visually.

## Cleanup
This investigation went through several throwaway Playwright scripts (screenshot capture, DOM
coordinate dumps, raw SVG attribute dumps) against production servers on ports 5305-5310, plus
Python/Pillow crop-and-zoom images for visual inspection — all deleted, along with the generated
`.codex/audits/`/`.codex/demos/`/`.codex/sessions/`/`.codex/feedback/` runtime artifacts, before
finalizing this UOW.

## UOW-15 complete
Both requested fixes shipped, plus the actual root-cause bug (a classic Solid destructuring pitfall)
found and fixed rather than papered over with a positioning workaround that would have looked right
briefly and drifted again the next time any node moved.
