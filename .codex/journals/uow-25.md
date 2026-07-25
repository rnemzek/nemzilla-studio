# UOW-25 Developer Journal — Fix Swarm Build Hand-off Error, Restore andiamo Alias, Adjust PO Nudging, Artifact Export Button

## Issue 1: reproducing before fixing

The instructions described a symptom ("system_alert denied on Swarm Build Hand-off") and a suspected
cause ("missing or mismatched schema parameters"), but before writing any fix I wanted to see the
actual failure with my own eyes rather than patch based on a guess. I drove a real itinerary discovery
interview through the live UI — free text, several turns, real LLM calls — and watched what actually
happened at the swarm hand-off.

The first thing I found wasn't the reported bug at all: `agentStream.ts`'s `runSwarmPipeline()` calls
`synthesizeOrderEntryApp()` completely unconditionally. An itinerary interview ("Saturday Plan": pick
up dry cleaning, walk the dog, make tacos) got synthesized into `"Saturday Plan — Order Entry &
Approval"` — a shopping cart with a "Submit Order" button, "Add to Cart" catalog buttons, the whole
Dual-Engine order-entry shape. This is a real, confirmed bug and squarely matches the task's own
wording ("updating AppPreview.tsx with the generated itinerary HTML instead of getting stuck on
building" implies the *content itself* should be itinerary-shaped, not just that it should exist).

Digging into *why* this exists at all: `domainAgents.ts`'s own module doc comment says "AI Vendor/AI OE
are unconditional (every PO interview is fundamentally an order-entry app)" — that comment is simply
stale. It was true when this conversational swarm-build path was first built, before the itinerary
domain became a first-class citizen of this project (UOW-20's domain-neutral pivot, Plan C's Unified
Itinerary Synthesizer). Nobody had gone back and taught this *specific* code path — the "andiamo"
launch, as opposed to the classic `/run` pipeline or the direct `today-itinerary` scenario match — that
itinerary is a real destination now.

## Issue 1: finding the actual "denied" trigger required a second, deeper pass

The order-entry-vs-itinerary bug alone didn't produce a "denied" audit entry in my first repro — it
just produced the WRONG (but present) app. So I kept digging for the literal denial. I traced every
`system_alert` emission in `agentStream.ts` and found exactly one `policyStatus: 'denied'` path inside
`runSwarmPipeline()`: `if (!catalog || !policyRules) { ...denied... return }`, guarding against reading
back an incomplete session bundle.

That check itself is fine. The real question was: under what real circumstance would the bundle be
incomplete for an interview the visitor experienced as fully finished? I traced backward through the
whole hand-off chain — `terminalCommands.ts`'s `persistInterviewArtifacts()` (writes the bundle, gated
on `state.vendorName && state.catalog` / `state.hitlThreshold !== null`) — and one line up from there,
`poInterview.ts`'s `applyTurn()`:

```ts
state.vendorName = data.vendorName
state.catalog = data.catalog
state.hitlThreshold = data.hitlThreshold
```

This unconditionally overwrites the client's tracked state with whatever the *latest* API response
says — including `null`. The system prompt tells the model "once a field is confirmed, keep reporting
it in every subsequent turn" — but that's an instruction to an LLM, not a guarantee the code enforces.
If the model's response on the exact turn `done` flips to `true` ever omits re-stating one already-
confirmed field (entirely plausible non-determinism for any structured-output model, especially with
vocabulary switching between "vendor/catalog" and "day-plan/tasks" framing mid-conversation), the
client silently regresses that field back to `null` — and `persistInterviewArtifacts()`'s gate then
skips writing that artifact. The swarm hand-off later reads back a bundle missing exactly that piece
and reports "denied — no completed discovery interview found," which is *correct given what it sees*,
but wrong given what the visitor actually experienced (a completed interview).

This is the kind of bug that's genuinely hard to catch with a single scripted repro, since it depends
on a specific LLM response shape on a specific turn — but the fix doesn't need to wait for that exact
reproduction to be justified: relying entirely on "the model will always comply with a natural-language
instruction to re-state old data" is a real gap regardless of how often it actually manifests, and the
fix (`data.X ?? state.X` — never let a confirmed field regress to null) closes it unconditionally,
with zero cost to correctness (it only ever *keeps* a real, previously-model-reported value; it never
invents one).

## Issue 1: routing the right synthesizer without inventing a new domain-tagging system

Fixing the wrong-domain-synthesis bug needed a way to know, at hand-off time, "was this an itinerary
interview or an order-entry one" — but the whole point of UOW-20's domain-neutral extraction contract
is that there's no separate "domain" field anywhere in the pipeline; vendorName/catalog/hitlThreshold
are deliberately the same shape regardless of what's actually being discussed. Reaching for
`getActiveTemplate()` (the client's reactive template signal) would have reintroduced exactly the bug
UOW-20 fixed — a visitor who never touches `/template` and just talks naturally about their day would
still show `activeTemplate = order-entry` (the default), so that signal doesn't reflect what the
interview is actually about.

The right signal was already running in this exact function: `dispatchDomainAgents()` performs a real
semantic classification of the vendor/catalog content (a Haiku call, not keyword matching — see its own
doc comment on why) and conditionally dispatches "AI TODO" specifically for "vendors whose app involves
tracking to-dos or errands." I verified empirically that my itinerary test session correctly triggered
"AI TODO" dispatch. Reusing that boolean (`dispatched.some(d => d.agent === 'AI TODO')`) to pick the
synthesizer is consistent with this pipeline's existing philosophy (real classification, not string
matching) and avoids building a second, redundant domain-detection mechanism.

For the itinerary synthesizer itself (`synthesizeItineraryApp()`), I kept it deliberately simple —
same flat `{name, price}` catalog-item input the interview actually collects, rendered as a checklist
rather than a cart. I didn't reach for the richer `UnifiedItineraryPayload`/`buildUnifiedItinerarySnippet()`
schema (categories, recipe sub-checklists, entertainment banners) because that richness genuinely isn't
part of what this conversational discovery interview collects — building toward a schema the interview
can't actually populate would just be a different flavor of the same mismatch bug. I did reuse the
established completion visual language from UOW-24 (`transition-all line-through opacity-50`, a live
progress badge) since that's the right amount of consistency without over-reaching.

## Issue 2: andiamo as a real prompt-level trigger, without breaking "never invent values"

The instructions wanted andiamo/build/go//build recognized as instant-completion signals. The naive
version of this rule — "if the visitor says one of these words, immediately finish and say the
acknowledgment" — would have directly reintroduced the Issue 1 field-regression risk in a new form:
forcing `done: true` without genuinely-confirmed fields is exactly how an incomplete bundle gets
written. So the rule I wrote is conditional: recognize the trigger words at any point in the
conversation (not just once the model's own pacing would already say "Ready to build"), but only
actually flip to `done: true` and emit the exact acknowledgment string if all three fields are already
confirmed; otherwise stay terse and say what's still missing, never faking completion just because the
trigger word appeared.

I verified this distinction actually holds with a direct API-level test: providing the last missing
field and "andiamo" in the *same* message produced `done: true` and the exact required string
`"Andiamo! Verifying the hand-off package..."` — proving the model recognizes the word itself as a
completion signal, not merely reacting to the fields becoming complete.

I also found a related, concrete client-side bug while reading `terminalCommands.ts`'s `/build`
handler: when the interview was already `done`, typing `/build` fell through to `startInterview()` —
silently discarding the just-finished interview and starting over from scratch, rather than launching
it. This directly contradicts treating `/build` as one of the recognized "instant completion" aliases
alongside `/andiamo`, so I fixed it to call `runAndiamo()` in that case, matching `/andiamo`'s own
behavior.

## Issue 3: removing the nudge, not softening it

I reproduced the actual unsolicited-nudge behavior before touching the prompt: a completed itinerary
interview's PO volunteered "By the way, would you like me to add the game tonight to your evening
schedule so it's all in one place?" — entirely unprompted. This was UOW-22's own itinerary proactive
nudge working exactly as designed then, now explicitly unwanted. I removed that nudge bullet entirely
rather than trying to make it "less pushy," and replaced it with an explicit anti-nudge rule scoped to
itinerary/day-plan conversations specifically: capture the visitor's own stated tasks/times/schedule
and nothing more, unless the visitor brings up dinner/entertainment themselves first. I left the
order-entry-path nudges (retail-category seed items, threshold discount suggestion) untouched, since
the task's wording ("food recipes, cooking checklists, TV/entertainment") is specifically about the
itinerary-flavored nudges, not the order-entry ones — a different, unrelated feature.

I verified the fix with a fresh conversation identical in shape to my earlier nudge-reproducing one and
confirmed zero food/TV/recipe/entertainment language appeared in any of the PO's replies.

## Issue 4: aggregating exactly the three things asked for, nothing invented

`artifactExport.ts` reads the same three reactive stores the Studio's own panels already render
from — `interviewStore.ts` (PO hand-off state), `sandboxStore.ts` (active swarm session metadata), and
`auditStore.ts` (recent ledger entries, capped at the last 20 so this doesn't balloon on a long
session) — and formats them as one Markdown document with fenced code blocks per section. The button
itself (`AuditLedgerPanel.tsx`) reuses `PublishModal.tsx`'s established copy/"✅ Copied!"-for-1.5s
pattern rather than inventing a new clipboard-feedback convention.

## Verification

- `npx tsc -b` and `npm run build` (as requested) — both clean.
- A rebuild reminder mid-verification: this project's `NODE_ENV=production` Playwright pattern serves
  the prebuilt `dist/` bundle, not live source — my first attempt to verify the new Copy button found
  it genuinely missing from the DOM, which turned out to mean "you forgot to rebuild after this edit,"
  not "the code is wrong." Worth restating since it's bitten this project's own verification passes
  before and will again: a missing change in a production-mode test run means check the build step
  first.
- Full production-mode Playwright pass, driving a genuine itinerary discovery interview through the
  real UI end to end (not a synthetic bundle seed this time): free-text conversation, "andiamo,"
  clicking Build, and confirming — zero `denied` entries anywhere in the Audit Ledger; the App Preview
  device frame rendering the actual itinerary checklist (`✨ Saturday Plan`, all 3 real tasks,
  `0/3 Completed` badge) instead of an order-entry cart; and the Copy Debug Artifacts button producing
  real clipboard content containing all three required sections (confirmed via
  `navigator.clipboard.readText()`, with the "✅ Copied!" label transition confirmed via an in-page
  `MutationObserver` after Playwright's own click-actionability timing produced a false negative on a
  naive polling check — a test-script quirk, not a product bug, the same category of thing this
  project has hit and correctly identified before).
- Two supplementary, more targeted checks at the API level (isolating each fix from the noise of a
  full UI run): (a) confirmed the system-prompt-level andiamo recognition specifically, not just the
  pre-existing done-already-true client shortcut, by providing the last missing field and "andiamo" in
  one message and getting the exact required acknowledgment; (b) confirmed zero unsolicited food/TV
  nudges across a fresh itinerary conversation, where the identically-shaped conversation before this
  fix produced one.

## Cleanup

Deleted all throwaway verification/repro scripts, killed all throwaway servers (ports 5330-5334), and
removed the runtime artifacts they generated (`.codex/audits`, `.codex/demos`, `.codex/sessions`,
`.codex/feedback`, `data/`).

## UOW-25 complete

All four issues fixed and verified against a real running server and browser. Issue 1 in particular
turned out to be two separate, compounding bugs — a wrong-domain synthesizer and a silent client-side
field regression — neither of which would have been found without actually reproducing the reported
symptom instead of patching from the ticket description alone.
