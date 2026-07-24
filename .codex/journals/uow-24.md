# UOW-24 Developer Journal — UAT Feedback Pass: Always-On Exec Summary, Panel Help Pop-overs, App Preview Device Frame

## Part 1: removing the gate, not just working around it
UOW-23 built `executiveShowcaseStore.ts` with a `localStorage`-backed "seen" flag specifically so the
pitch modal wouldn't nag a returning visitor. This task reverses that decision outright — the modal
should always show on a fresh load or new tab, no exceptions. Rather than leaving the flag-reading
code in place but ignoring its result (a half-finished state that would confuse the next person reading
the file — "why is there dead `loadSeen()`/`persistSeen()` code that's never called?"), I deleted the
`STORAGE_KEY`, `loadSeen()`, and `persistSeen()` functions entirely and just initialize the signal to
`true` unconditionally. `dismissExecutiveShowcase()` and `openExecutiveShowcase()` keep their names and
call sites (`EcosystemNav.tsx`, `ExecutiveShowcaseModal.tsx`) unchanged, since the *behavior* those
call sites need — "close it" / "open it" — hasn't changed, only whether anything persists across a
reload.

## Part 2: writing real per-panel copy, not placeholder text
The instructions asked for pop-overs that explain "what that specific panel does, its role in the
ecosystem, and how to interact with it" — I wrote distinct copy per panel rather than a templated
sentence with the panel name swapped in, since each panel genuinely does something different and a
visitor reading the Swarm Canvas's help shouldn't get boilerplate that only vaguely differs from the
Audit Ledger's. Swarm Canvas explains the live pipeline + Replay Mode; AgentZ Chat explains the
free-text-to-AI-PO routing + slash commands; App Preview explains the three tabs + the Publish/
Preview-domain actions; Audit Ledger explains the hash-chained governance trail. Each is two short
paragraphs, matching this project's existing terse-copy convention elsewhere (the guided banner, the
executive modal's bullets).

## Part 2: the bug that only showed up by actually clicking through all four
Building `PanelHelpButton.tsx` once and reusing it four times was the easy part. Wiring it into
`AppPreview.tsx` is where things went wrong — and where checking the screenshot instead of trusting
"it compiles" caught a real bug before it shipped.

I first placed the help button inline, inside AppPreview's existing header-row status cluster (next
to the "building…"/"ready" status text). A screenshot taken mid-build (while a swarm was still
generating, `sandbox.state.status !== 'ready'`) showed the button rendered nowhere near the top-right
corner — it, along with the status text, had wrapped onto its own line below the tabs row, and its
popover opened overlapping the *Terminal* panel to the left instead of staying inside App Preview's
own card. The cause: that header row is `flex flex-wrap`, and its right-side content's width varies
(Save/Publish buttons only render once the build is `ready`) — under realistic conditions (mid-build,
narrower viewports, longer tab labels) that row genuinely wraps, which the other three panels' header
rows never do (none of them are `flex-wrap`). An inline placement that happened to look right in one
screenshot would have been wrong in the very next one.

The fix: pin the button with `absolute right-3 top-2` directly on the `<section>` (given `relative`),
completely decoupled from that row's own wrap state — so it's always in the actual top-right corner of
the card regardless of what's happening in the row beneath it. I added `pl-4 pr-10` in place of the
row's old `px-4` so the reserved corner space doesn't visually collide with the status text/Publish
button when they're present.

## Part 2: the second, subtler bug — a self-inflicted stacking-context trap
Re-running the full verification script after that fix surfaced a second failure: clicking the Audit
Ledger panel's help button (the last of four in the test's loop) timed out, blocked by App Preview's
*own* popover backdrop — meaning App Preview's popover from the *previous* loop iteration hadn't
actually closed, even though the test explicitly clicked elsewhere (`(5, 5)`) to close it first.

The root cause was in my own first-attempt fix: I'd wrapped the pinned button in
`<div class="absolute right-3 top-2 z-10">`. Setting `z-10` on a positioned element creates a *new
stacking context* — every descendant's own z-index (including `PanelHelpButton`'s internal
`fixed inset-0 z-20` backdrop and `z-30` popover) gets capped inside that z-10 layer for the purposes
of competing against anything *outside* it. `EcosystemNav.tsx`'s sticky header is `z-20` at the page's
root stacking level. Once App Preview's backdrop got trapped inside a z-10 context, it could no longer
actually out-rank the header at z-20 in the real page — so a click at a coordinate under the header
hit the header instead of the backdrop meant to catch it, and the popover just... stayed open,
invisible to the naked eye as a problem until something later depended on it being closed.

This is exactly the kind of bug that's easy to introduce with a defensive "let me just add a z-index
to be safe" instinct, and exactly the kind that a passing `tsc -b`/`npm run build` would never catch —
it's a runtime stacking/interaction bug, not a type or compile error. The fix was to remove the
`z-10` entirely: the wrapper doesn't need its own z-index to visually sit above the in-flow header-row
content beneath it (a positioned element with `z-index: auto` still paints above non-positioned
siblings per normal CSS stacking rules), and without a z-10 stacking context in the way, the popover's
own internal z-20/z-30 values compete directly and correctly against the rest of the page, exactly like
the other three panels' (non-wrapped, no extra z-index) help buttons already did.

I only found this because the verification script ran all four panels' popovers *in sequence* rather
than testing each in isolation — a bug that only manifests as "the previous thing didn't clean up"
needs exactly that kind of sequential, stateful check to surface.

## Part 3: the device frame
This part was more straightforward. The task specified exact classes
(`rounded-2xl border border-slate-700/80 shadow-2xl bg-slate-900/90`) and an exact visual language (a
mock device status bar) — I implemented it close to literally: a `flex-col` frame with a small
shrink-0 status bar row (mock "9:41" time — a deliberately static value matching the classic App Store
screenshot convention, not a live clock, since this is chrome rather than a feature) above a
`flex-1 overflow-hidden` wrapper holding the existing iframe. The avatar pill uses the real,
already-tracked visitor handle (`visitorState.identity?.handle`, the same value `VisitorTag.tsx` and
`Terminal.tsx`'s greeting already surface) rather than a hardcoded example name — genuinely more
polished, since it makes the device frame feel personalized to whoever's actually looking at it, and
the mechanism was already sitting right there to reuse.

For the "no double-scrollbar" requirement: I didn't introduce any new `overflow-auto`/`overflow-y-auto`
container. The iframe already just fills `h-full w-full` of its immediate wrapper, and that wrapper is
`overflow-hidden` purely to clip the device frame's rounded corners, not to scroll anything — so the
only scrollbar that can ever appear is whatever the generated app's own document produces internally,
exactly as before this change. Verified this directly via a DOM check (`scrollHeight > clientHeight`
on the frame) rather than assuming it from the CSS alone.

## Verification
- `npx tsc -b` (as requested) — clean.
- `npm run build` (as requested) — clean.
- Full production-mode Playwright pass, run twice (once before, once after the two layout-bug fixes
  above) plus real screenshots at each stage — this project's standing convention for anything with
  visible runtime behavior, doubly justified here since two of the three tasks are explicitly visual:
  - The modal shows on load even with `agentz_executive_seen=true` pre-seeded in `localStorage`
    (proving the gate is truly gone, not just defaulted differently), and shows again after a genuine
    page reload.
  - All four panels' "?" buttons open their popovers with the correct title, clicked in sequence
    without one panel's popover blocking the next — the exact scenario the stacking-context fix
    addressed, confirmed only by testing all four together rather than each in isolation.
  - The device frame's classes, the "9:41" mock time, and the `👤 {handle}` avatar pill all render
    correctly; a direct `scrollHeight`/`clientHeight` check confirmed the frame itself has no
    scrollbar of its own.
  - Zero new console errors (the one message seen was the same pre-existing, already-documented
    `auditStore.ts` reload artifact from prior UOWs).

## Cleanup
Deleted both throwaway scripts (`scripts/verify-uow24.tmp.mjs`, `scripts/screenshot-uow24.tmp.mjs`),
their screenshots, the throwaway servers (ports 5322/5323), and the runtime artifacts they generated
(`.codex/audits`, `.codex/demos`, `.codex/sessions`, `.codex/feedback`, `data/`).

## UOW-24 complete
All three UAT items shipped. Two genuine layout bugs — the flex-wrap mispositioning and the
self-inflicted stacking-context trap — were caught and fixed during verification rather than shipped,
neither visible from reading the source alone, both found only by actually loading the page and
clicking through the real interaction sequence.
