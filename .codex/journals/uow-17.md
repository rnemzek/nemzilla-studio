# UOW-17 Developer Journal — Pass E Kickstart: Multi-Agent Swarm Catalog

## What was asked
A "kickstart" prompt for Layer 2 — a `templateRegistry.ts` config describing 3 selectable "domain
swarms" (order-entry, "What's For Dinner", day-planner/itinerary), a `/template` slash command to
list/switch between them, wiring so the switch actually re-hydrates the Swarm Canvas / App Preview /
AI PO system prompt, and a branding pass scrubbing "terminal"/"CLI" language from user-facing copy.

## Design decisions and why

### The registry lives in a shared file, not two copies
`templateRegistry.ts` needs to be read from the browser (SwarmCanvas, AppPreview, the terminal) and
from the server (the AI PO's system prompt). This project already solved that exact cross-boundary
problem once — `actionKit.ts` is included as an explicit individual file in `tsconfig.node.json`'s
`include` array so it type-checks under both the browser and server tsconfig projects without being
duplicated. I did the same for `templateRegistry.ts` rather than either (a) writing it twice (drift
risk) or (b) duplicating just the strings that matter to each side (loses the single-source-of-truth
property that's the whole point of a "registry").

### The Swarm Canvas idle preview never fakes real telemetry
The trickiest design question was "what does 'renders the active template's specific agent node
personas' actually mean," given the Swarm Canvas's entire design (since Pass B) is to visualize
*real* server-driven pipeline execution — it has no fake/simulated agent steps. Fabricating a fake
pipeline run that pretends to "execute" the template's personas would have been dishonest in a way
this project has consistently avoided (every other agent step, even in the fully-simulated classic
pipeline, corresponds to a real server-side stage that actually ran).

The honest scope: the template's personas are an *idle preview* — shown whenever nothing real is
currently running — and the instant a genuine pipeline starts, the canvas shows what the server
actually executed, personas or not. Implementing "the instant a genuine run starts" cleanly required
a new signal: `swarmStore.ts`'s `SwarmState` gained a `runGeneration` counter, bumped inside
`resetForNewRun()` (which already fires exactly once per genuine new run, on a `RUN_START_AGENTS`
`EXECUTING` event). `SwarmCanvas.tsx` watches that counter with an accumulator effect
(`createEffect((prev) => {...; return gen}, ...)`) and flips a local `showTemplateIdle` signal to
`false` the moment it changes — a one-way door that only a real run can close, and only `/template`
switching (or first mount) reopens.

One subtlety this exposed: the classic pipeline's boot demo auto-starts within ~100ms-2s of page
load (`AppPreview.tsx`'s `onMount` calls `connectGenerator` immediately), so the template idle
preview is barely visible on a *fresh* page load before the real boot demo's events arrive and take
over. That's fine and expected — the feature's actual value is post-switch: after a visitor runs
`/template wfd`, the WFD personas stay on screen indefinitely (nothing auto-relaunches a build), and
only genuinely start something new (typing to the AI PO and completing a swarm build, or clicking
"Preview this domain") hands the canvas back to real telemetry.

### Tailwind color classes must stay literal strings
`SwarmNodePersona.color` is a bare token (`'sky'`, `'orange'`, etc.), not a Tailwind class string.
Interpolating `stroke-${color}-400` at render time would look right in dev but silently vanish from
the production build — Tailwind's build-time scanner only keeps classes it can find as literal
strings somewhere in source, and a template-literal interpolation isn't one. This is the exact same
lesson `RnAvatar.tsx` already had to learn the hard way (UOW-15's CSP/inline-style investigation
surfaced a related but distinct issue in the same area of the codebase). `PERSONA_STROKE_CLASS` is a
small static `Record<string, string>` mapping each of the 9 known tokens (3 templates × 3 personas
each) to a literal class string — safe by construction.

### The AI PO overlay reframes vocabulary, doesn't fork the schema
The base discovery prompt (`poInterviewLLM.ts`) extracts exactly three fields — `vendorName`,
`catalog`, `hitlThreshold` — via a hand-written JSON-schema structured output. Building three fully
independent AI PO conversation flows (each with its own extraction schema — recipes/pantry for WFD,
teams/schedule for itinerary) would be a materially larger undertaking than a "kickstart," and would
mean the swarm-build pipeline downstream (which consumes exactly `vendorName`/`catalog`/
`hitlThreshold` today) would need three parallel code paths too.

Instead, `systemPromptOverlay` is literal additional context appended to the base prompt — it tells
the model to keep extracting the *same three fields*, just under this domain's own vocabulary (e.g.
WFD: "treat the vendor/company name as the household or meal event's name, the catalog as recipe
ingredients... with a per-serving cost"). This is honestly scoped as reframing, not a new
conversation architecture, and I said so directly in the registry's own doc comment rather than
letting the shipped code imply more than it does.

Wiring this through required one real plumbing change: `poInterview.ts` (client) now sends the
active `templateId` on every turn (reading `templateStore.ts`'s signal directly, no extra prop
threading needed since it's a module-level export); `poInterviewHandler` looks it up via
`getTemplate()` and passes the resolved `systemPromptOverlay` string into `runPoInterviewTurn()`,
which appends it between the base prompt and the "already confirmed so far" summary. An
unrecognized/omitted `templateId` degrades gracefully (no overlay applied, base prompt still works
standalone) rather than erroring — matters for backward compatibility with any client that predates
this change.

### App Preview never auto-relaunches on template switch
Directive 3 says switching the template should "prepare view routing" for App Preview. I considered
having `/template <id>` immediately relaunch the boot demo with that domain's seed prompt, but
rejected it: a visitor mid-interaction with whatever's currently in App Preview (maybe they're
testing the cart, maybe reading the source tab) shouldn't have it yanked out from under them just
because they explored a different domain in conversation. Instead, `AppPreview.tsx` gained a small
domain-indicator row showing the active template's name, plus an explicit "🎯 Preview this domain"
button — real, wired, and using the exact same `connectGenerator()` fire-and-forget pattern
`CookbookDropdown.tsx` already established for one-shot triggered builds — but only fires when the
visitor actually clicks it. For `wfd` (no dedicated generator), the button is replaced with an
honest "Preview coming soon for this domain" label rather than silently falling through to the
generic, unrelated `default-sandbox` card under a misleading domain name — showing a bare "Try a
prompt containing..." placeholder card labeled "What's For Dinner" would have been more confusing
than admitting the gap.

### Branding guardrails
Applied directly: `Terminal.tsx`'s header text (`"AgentZ CLI"` → `"AgentZ"`), the `$` shell-prompt
markers (the echoed input-history prefix became a clean `>`; the live input row's marker became
`✨`), and every other visible "terminal"/"CLI" mention I could find via a project-wide grep
(`GuidedWorkflowBanner.tsx`'s "in the terminal below" and `ArtifactsPanel.tsx`'s empty-transcript
fallback, both reworded to reference "AgentZ"/the input box directly rather than terminal framing).
Left alone: internal identifiers that are never rendered to a user — the component file
`Terminal.tsx`, its exported function name, `data-testid="terminal"`, and code comments — since the
guardrail is about user-facing copy, not internal naming.

## Real bug found and fixed
Verifying `/template` (typing the complete word and pressing Enter) revealed it silently did
nothing on the first Enter press — it took a second press to actually run. Root cause: Pass D's
slash-command palette treats *any* Enter while the palette is showing (i.e., whenever the input
starts with `/` and has no space yet) as "complete the highlighted suggestion into the input,"
regardless of whether the typed text is already a complete, valid command name. Typing `/template`
(no args needed) and pressing Enter matched exactly one palette suggestion (itself), so Enter just
re-filled `/template ` and returned — never reaching the actual submit path below. Fixed by checking
whether the typed text already exactly equals the highlighted match's name; if so, Enter now falls
through to the normal submit logic instead of re-completing. Tab is unaffected (it always completes,
which is the expected convention for that key).

I found this specifically *because* my own verification script typed a full command and expected it
to run in one Enter press — a subtly different test than Pass D's own verification, which happened
to always test partial-then-select-then-submit sequences, or single already-known short commands
where the timing masked the issue. Worth noting as a reminder that testing the exact interaction
pattern a real user would use (type the whole thing, hit Enter once) matters as much as testing that
the underlying feature works at all.

## Verification
- `npx tsc --noEmit` (as explicitly requested) — clean. Also ran `npx tsc -b` (the project-references
  build mode this repo's own `npm run build` actually uses) for full confidence, since the root
  `tsconfig.json` has an empty `files` array and delegates entirely to its two project references —
  clean there too.
- `npm run build` — clean.
- `npm run test:sse` — clean, unaffected (no server streaming contract changes).
- Full production-mode Playwright verification (purpose-built script, per this project's established
  workaround for the dev-server HMR reload-loop issue) confirmed, in order: the rebranded header text
  and clean prompt markers (no "AgentZ CLI" anywhere); `/template` with no args lists all three domain
  ids; `/template wfd` re-renders the Swarm Canvas with the Sous-Chef/Grocery Pantry/Media Linker
  personas and shows "Preview coming soon" in App Preview; `/template itinerary` shows its own three
  personas with exactly 3 correctly-colored node strokes found in the DOM, and its own working
  "Preview this domain" button, which — when clicked — both loads the real `today-itinerary`
  generator's source *and* correctly hands the Swarm Canvas back to the real pipeline's own
  Planner/Architect nodes once that genuine build starts (proving the idle-preview-to-real-run
  handoff works, not just the idle preview in isolation); `/template order-entry` switches back
  correctly; an unknown template id shows a clean error; and — the most important check — a real AI
  PO interview turn with the `wfd` overlay active produced genuinely dinner-flavored phrasing ("So
  this Friday Family Dinner is your event... what meals or dishes are you planning to serve, and
  what's the cost per serving") rather than generic vendor/catalog language, confirming the overlay
  has a real, measurable effect on the model's actual output — not just plumbing that compiles but
  does nothing observable. Zero console errors throughout.

## Documentation note
`.codex/AGENTZ-STUDIO-SDK.md` already had a small, dangling draft stub for this exact feature when I
started (an unclosed code fence, ending mid-interface, and describing a `React.ComponentType` preview
prop despite this being a SolidJS project — almost certainly left over from drafting the directive
itself). Rather than silently deleting it or leaving a broken fragment in a load-bearing shared doc
(this file is served live to the running app via `GET /api/bible`), I replaced it with a complete,
accurate Section 14 following this doc's own established per-UOW section convention, and flagged the
find explicitly instead of quietly absorbing someone else's in-progress note.

## Cleanup
Verification spun up a throwaway server on port 5313 plus real `.codex/audits/`/`.codex/demos/`/
`.codex/sessions/` runtime artifacts (from both the Playwright pass and `test:sse`) — all deleted
before finalizing, along with the `verify-passe.tmp.mjs` script itself.

## UOW-17 complete
All 4 Pass E kickstart directives shipped: the template registry construction, the `/template` slash
command, dynamic workspace re-hydration (Swarm Canvas, App Preview, AI PO overlay) without
fabricating fake telemetry, and the branding/UX guardrail pass — plus a real, verification-caught
slash-palette bug fixed along the way.
