# UOW-22 Developer Journal — Proactive AI PO System Prompt & Interactive Task Strikethrough

## Part 1: fixing the file reference before writing anything
The kickoff task named `appGeneratorPrompt.ts` as where Part 1's PO conversation guidance belongs.
Before touching anything, I read that file end to end (it's only 657 lines) to find the PO's existing
conversational text — and there isn't any. `appGeneratorPrompt.ts` contains exactly two things: the
Dev agent's build prompt (`buildAppGeneratorSystemPrompt()`, instructions for generating the sandboxed
micro-app's HTML/JS) and the actual snippet synthesizers (`buildAcmeOrderSnippet`,
`buildUnifiedItinerarySnippet`, the B2B lead-scoring snippet). None of that is what a visitor's
messages get sent against during the discovery interview.

The actual AI PO system prompt — the one `runPoInterviewTurn()` sends to Claude Haiku on every
interview turn — is `poInterviewLLM.ts`'s `SYSTEM_PROMPT`, with domain-specific flavor optionally
layered on top from `templateRegistry.ts`'s `systemPromptOverlay` field (see that file's own doc
comment: "Appended to (never replacing) `poInterviewLLM.ts`'s base `SYSTEM_PROMPT`"). This is exactly
the kind of file-attribution mismatch this project has hit before (the earlier `z-50`→`z-30`
correction in UOW-20 is the same shape of thing: an explicit instruction that doesn't match what's
actually in the codebase) — the fix is to implement the *intent* in its real location, not force the
literal file reference to be true. I made this correction explicit in both the journal and the
context/architect-journal docs rather than silently doing something different from what was asked.

## Part 1: the greeting, scoped carefully against UOW-20's fix
The dual-path greeting requirement ("AgentZ can build either an Order Entry app or a Unified
Itinerary app") is in real tension with UOW-20's domain-locking bug fix, which deliberately made the
base prompt domain-*neutral* so a request like "let's make my to-do list" wouldn't get steered toward
order-entry framing. If I'd just prepended "You can build an order-entry app or an itinerary app" as a
standing instruction applied to every turn, that's arguably a regression of exactly the bug UOW-20
fixed — a model given "order entry" as one of only two named categories on every turn has more surface
to default back to it than a model that's never told there's a menu at all.

The resolution: scope the dual-path framing strictly to the *greeting*, and scope the greeting
strictly to *turn one*. The new rule reads: "on your very first message of a brand-new interview
(there is no prior transcript yet)... Never repeat that greeting on any later turn; from the second
turn on, just follow the visitor's own words as described above." This gets the literal ask (visitors
are told upfront both paths exist) without re-introducing a standing bias toward either path once the
actual discovery conversation starts — every rule from UOW-20 (read their own words, never default to
order-entry framing on an unrelated request) still governs every turn after the first. The model has
enough signal to know it's turn one without an explicit flag: `buildMessages()` still passes the real
transcript array, so an empty prior transcript is just visibly a short messages array with only the
kickoff sentinel in it — no code change was needed to expose that.

## Part 1: nudges as an optional, self-limiting behavior
The two nudge categories (itinerary: TV/sports nudge or recipe-ingredient nudge; order-entry: category
recognition + seeded items, and separately a threshold-discount suggestion) are genuinely useful but
also genuinely risky if unconstrained — an AI PO that volunteers three unsolicited suggestions in one
reply reads as pushy, not proactive, and directly conflicts with the existing "keep replies short — one
or two sentences" rule and the "ask for exactly one missing thing at a time" rule already in the
prompt. I wrote the new rule with three explicit guardrails, matching how the rest of this system
prompt is already structured as bounded rules rather than loose suggestions:
1. At most ONE nudge per turn — never stacked with another nudge or with a missing-field question in
   a way that makes the reply balloon past a couple of sentences.
2. Never nudge before the vendorName/day-name is at least known — nudging blind (before the PO even
   knows what's being built) would be guessing, not a genuine suggestion.
3. Always droppable — if the visitor ignores it or answers something else, the PO drops it silently
   and returns to the actual required-fields flow. Explicitly stated that a nudge never blocks or
   delays `done` becoming true, since the three extracted fields are still the only real completion
   gate; nudges are flavor on top, not new requirements.

I placed the nudge rule in the base prompt (not per-domain `templateRegistry.ts` overlays) for the
same reason the greeting change lives in the base prompt: nudges need to fire based on the visitor's
own words and the domain the *conversation itself* reveals, not on whether `/template` was ever
explicitly invoked — that's the whole point of UOW-20's `templateExplicitlySet` gating, and nudges
that only worked after an explicit `/template` switch would undercut the natural-language routing that
fix established.

## Part 2: strikethrough + progress badge
This part was mechanical once the two attach points were found: `renderErrands()` and `renderRecipe()`
in `buildUnifiedItinerarySnippet()` (`appGeneratorPrompt.ts`) already built each checklist `<label>`'s
class list conditionally on `.completed` — I replaced the ad hoc `text-slate-500 line-through`
conditional in both places with a shared `completionLabelClass(isCompleted)` helper returning the
exact specified `transition-all line-through opacity-50` (checked) / `transition-all` (unchecked),
so both lists share one source of truth for what "done" looks like rather than drifting independently.

The progress badge covers every checkable item across *both* lists (errands + recipe ingredients) as
one combined count, rather than a separate counter per section — the itinerary is already presented
as one unified plan (that's the entire point of Plan C's Unified Itinerary Synthesizer merging what
used to be three separate domain silos), so a single "3/9 Completed" readout next to the title matches
that framing better than two independent per-section badges would. `updateProgressBadge()` is called
from both render functions' checkbox-change handlers (so it updates on every toggle) and from the
initial-render/restore-state code paths (so a page that loads with some items already checked shows
the correct count immediately, not "0/9" until the first click).

## Part 2: dual persistence — verified, not re-built
The "Dual Persistence" requirement was already fully implemented before this task, from Plan C's
original itinerary work: `persistState()` does both a `postMessage` relay to the parent (for the
sandboxed iframe, whose opaque origin makes its own `localStorage` worthless across reloads) and a
direct own-origin `localStorage.setItem()` (for a standalone `/share/:slug` page, which has no parent
to relay to but is a completely normal origin). Since neither `persistState()` nor `applyState()` nor
the state-collection logic (`collectState()`) needed any changes for this task — only the *rendering*
of completion state (label classes, the new badge) changed — I didn't touch that code, and instead
spent verification effort confirming the existing mechanism still covers the new UI correctly rather
than assuming it does.

## Verification
- `npx tsc -b` (as requested) — clean.
- `npm run test:sse` (as requested) — clean (all 5 sub-checks passed, unrelated to this change but
  confirms the SSE/generation pipeline that both parts sit on top of is still healthy).
- Full production-mode Playwright verification, covering both contexts the task explicitly named:
  - **Sandboxed iframe**, driven through the real Studio UI (Cookbook preset launcher → "My TODAY"
    Itinerary), not a synthetic DOM test: initial `#progress-badge` read `0/9 Completed` (2 errands +
    7 recipe ingredients in the default payload); checking the first errand item applied
    `transition-all line-through opacity-50` to its label and updated the badge to `1/9 Completed`.
    Hit the project's documented single-active-builder race on the first attempt (the preset click
    landed as a spectator of the still-finishing boot demo instead of claiming a fresh build) — fixed
    with the same established buffer-sleep-after-"ready" pattern used in prior UOWs' verification
    scripts, not a product change.
  - **Standalone `/share/:slug`**: captured the itinerary scenario's final generated code directly off
    the `/api/agent/stream` SSE frames, wrapped it the same way `buildSandboxDocument()` does, and
    published it via a real `POST /api/publish` call. On the resulting real published page: initial
    badge `0/9 Completed`; checking two recipe ingredients updated the badge to `2/9 Completed` with
    strikethrough applied to both; **a real page reload** (not a simulated state restore — an actual
    `page.reload()`) correctly restored both the checked state and the `2/9 Completed` badge count,
    confirming the own-origin `localStorage` path still works end-to-end with the new rendering code.
  - Zero new console errors — the one message seen (`audit stream error TypeError: network error`) is
    the same pre-existing, already-documented `auditStore.ts` reload artifact from UOW-15/21.

## Cleanup
Deleted the throwaway verification script (`scripts/verify-uow22.tmp.mjs`), its screenshots, the
throwaway port-5320 server, and the runtime artifacts it generated (`.codex/audits`, `.codex/demos`,
`.codex/sessions`, `.codex/feedback`, `data/`).

## UOW-22 complete
Both parts shipped. Part 1 landed in the file that actually governs the AI PO's conversation
(`poInterviewLLM.ts`) rather than the one named in the kickoff, with the dual-path greeting and nudge
rules deliberately scoped so they add personality without reopening UOW-20's domain-locking bug. Part
2's strikethrough and progress badge were verified live — checkbox toggle, visual state, and a real
reload's persistence — in both contexts the task named, not just compiled.
