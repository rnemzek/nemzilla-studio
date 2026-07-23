# UOW-16 Developer Journal — Pass D: AgentZ CLI Rebrand, Guided Onboarding & App Preview Polish

## What was built

### 1. Rebrand & AI-First Terminal Experience
The rebrand itself was trivial (`Terminal.tsx`'s header text, `"nemzilla-cli"` → `"AgentZ CLI"`).
The bigger piece was the routing model change: commands move behind a `/` prefix, and *all* other
free text becomes conversational input to the AI PO, unconditionally.

Before this UOW, `terminalCommands.ts`'s `runCommand()` had a layered fallback: known bare words
(`help`, `run`, `build`, ...) were commands; an unrecognized *multi-word* string started a PO
interview; a single unrecognized word was a plain error. That logic existed specifically to avoid
accidentally triggering a billed LLM call on a stray typo — reasonable at the time, but it made the
terminal feel like a command shell with a chat feature bolted on, not a chat-first interface. The new
model inverts that: `runCommand()` checks `trimmed.startsWith('/')` first; if so, it dispatches
through `runSlashCommand()` (a switch over `SLASH_COMMANDS`' names); otherwise, the entire line is
free text and *always* goes to the AI PO conversation path (continuing an active interview, starting
a fresh one, or — if the interview is done and the text matches a launch phrase like "build it" —
launching the swarm build).

This let me delete real complexity: `INTERVIEW_META_COMMANDS` (the old plain-text
"cancel"/"exit"/"quit" interception, checked inside `continueInterview()` so those words wouldn't get
sent to the LLM and misinterpreted as real answers) is gone entirely, along with the special-cased
plain "help"/"clear" checks mid-interview. Under the new model, all of that moved to `/reset` — a
single, explicit, always-available slash command checked *before* the interview-continuation branch
in `runCommand()`, so it works identically whether an interview is active, done, or hasn't started.

`SLASH_COMMANDS` is a single exported array (`{name, usage, description}`) that backs both `/help`'s
printed output and `Terminal.tsx`'s inline palette — one source of truth, so the two can't drift.
Two new commands: `/replay` (builds an ephemeral `SavedRun`-shaped snapshot from whatever's currently
live — `interviewState`, `auditStore.state.blocks`, `sandboxStore.state.code` — the exact same
sources `ArtifactsPanel.tsx`'s "Replay Current Run" button already reads — and hands it to
`replayStore.ts`'s `startReplay()`, so the Swarm Canvas's scrubber picks it up immediately) and
`/reset` (cancel any active interview, exit Replay Mode, clear the terminal, fresh start).

The dynamic greeting ("Welcome, {persona}! What would you like to build today?") needed to be
reactive rather than baked into the static welcome-lines array, since the visitor's persona hash
resolves asynchronously (`visitorStore.ts`'s `initVisitor()` — SHA-256 via Web Crypto) and might not
be ready the instant `Terminal.tsx` mounts. I moved it out of the `lines` store entirely into its own
reactive `<p>` reading `visitorState.identity?.handle` directly — it updates the moment the persona
resolves, and again if the visitor edits their handle via `VisitorTag.tsx` (Pass C), which is a nice
bonus consistency I didn't have to build separately.

**The slash palette:** shown only while the input starts with `/` and has no space or newline yet
(i.e., while typing the command name itself, not its arguments) — `filteredCommands()` filters
`SLASH_COMMANDS` by prefix match against whatever's typed after the `/`. Arrow keys cycle a
`paletteIndex` signal (reset to 0 on every keystroke so a new filter result always starts from the
top); Enter or Tab completes the highlighted suggestion into the input (with a trailing space, ready
for args) rather than submitting immediately — submission still requires a second Enter, avoiding any
ambiguity about whether a keypress just picked a command or ran it. Escape clears the input outright.

**Multiline input:** switching the `<input type="text">` to a `<textarea>` was the only way to
support real newlines. `Shift+Enter` is allowed to fall through to the textarea's native behavior
(insert a newline); plain `Enter` still submits. The trickier bit was history recall: the existing
ArrowUp/ArrowDown-cycles-through-history behavior would otherwise fight with using those same keys to
move the cursor within multi-line text, so history recall is now skipped entirely once the current
input contains a `\n` — arrow keys behave natively for editing in that case. The textarea auto-grows
via a small imperative `autoGrow()` (reset height to `auto`, then set it to `scrollHeight`) called on
every input event and after every programmatic value change (history recall, palette selection,
clearing on submit), capped at `max-h-32` with its own scroll so a giant pasted blob doesn't take over
the whole card.

### 2. Guided Workflow Banner & Window Controls
`GuidedWorkflowBanner.tsx` is a small, self-contained collapsible card: one sentence describing the
platform, a 1-2-3 step list matching the actual page layout (terminal → Swarm Canvas → App Preview),
and a collapse toggle persisted to `localStorage` so a visitor who already dismissed it doesn't see
it again on a later visit — but a first-time visitor (or one who cleared storage) always sees it
expanded by default. Mounted in `App.tsx` right above `<SwarmCanvas/>`.

The window controls were the "make them work or stop looking clickable" choice from the ask — I went
with making them work, mapping to the closest real semantics for a terminal that can't literally be
closed (it's core to the app): red = reset (same action as typing `/reset`, routed through the exact
same `runValue('/reset')` call so there's only one implementation of what "reset" means), yellow =
minimize (collapses everything below the header bar behind a `<Show when={!minimized()}>` — clicking
yellow again, still visible in the always-rendered header, restores it), green = expand (grows the
scrollable output area's `max-height` from the default `20rem` to `36rem`).

### 3. App Preview Fixes & Cart Management
The header-row overflow was a real layout bug, not just cosmetic: `AppPreview.tsx`'s tab bar + status
badge row had no `flex-wrap`, and this panel's *actual* rendered width is well under its own
`max-w-2xl` ceiling since it lives in a 3-column grid inside a `max-w-7xl` container — three tab
labels plus the conditional "💾 Save to Cookbook" button plus the status text competing for space in
a ~400-450px column will legitimately overflow without wrapping. Fixed with the same
`flex-wrap`/`shrink-0` pattern `EcosystemNav.tsx` already established for its own header (UOW-10 Task
10.3) rather than inventing a new approach — confirmed via a real narrow-viewport (900px) Playwright
check that the row's `scrollWidth` now equals its `clientWidth` (no overflow) where it previously
would have clipped.

Cart Remove/Clear needed the identical change in two places, since `appGeneratorPrompt.ts`'s
`buildAcmeOrderSnippet` (classic boot demo) and `swarmCodeSynthesizer.ts`'s
`synthesizeOrderEntryApp` (PO-interview-driven build) are near-byte-identical vanilla-JS templates by
design (the swarm-build one is explicitly documented as reusing "the exact same Dual-Engine app
shape" as the classic one). `renderCart()` in both now renders a per-line "Remove" button
(`data-index`-tagged, `cart.splice(index, 1)` + re-render on click) and the cart panel gained a
"Clear Cart" button next to Submit Order (`cart = []` + re-render). This is genuinely useful for the
policy interceptor demo specifically — a visitor can now add/remove items freely to land a total in
the auto-approve, HITL, or auto-deny band without reloading the whole generated app each time they
want to try a different price point.

## Consequence fix: the run-nemzilla-studio skill
Reading `.claude/skills/run-nemzilla-studio/driver.mjs` before finishing this UOW, I found its
default smoke scenario (`['help', 'metrics', 'triad', 'clear']`, no slash prefixes) and its input
selector (`input[type="text"]`) would both silently break under this UOW's own changes — bare
commands would now route to the (real, billed) AI PO instead of running anything, and the input is a
`<textarea>` now, not an `<input>`, so the selector would match nothing at all. Updated
`DEFAULT_COMMANDS` to slash-prefixed forms, fixed the selector and the initial-load wait text
(`"nemzilla-cli"` → `"AgentZ CLI"`), fixed a screenshot-filename bug the slash prefix would have
introduced (`01-/metrics.png` contains a literal `/`, which isn't a valid filename component), and
updated `SKILL.md`'s command table + added an explicit callout that bare text is no longer a command.
This wasn't asked for, but leaving it broken would have silently regressed an established piece of
this project's own test tooling as a direct side effect of a change I made — worth fixing in the same
pass rather than leaving for someone to discover later.

## Verification
- `npx tsc -b` / `npm run build` — clean.
- `npm run test:sse` — clean, unaffected (no server streaming contract changes).
- Ran the `run-nemzilla-studio` skill's own driver once by hand to sanity-check my updates — it hit
  this project's known, pre-existing dev-mode Vite HMR full-reload-loop issue (already documented in
  earlier UOWs' journals as an environment limitation, not a product bug), so I switched to this
  project's established production-mode Playwright workaround for actual verification instead, the
  same as every prior UOW's browser verification pass.
- Full production-mode Playwright verification (purpose-built script) confirmed, in order: the
  header shows "AgentZ CLI"; the dynamic greeting renders a real generated persona
  ("Welcome, Karena-Analyst-659! ..."); the guided banner is visible by default, collapses on click,
  and — critically — *stays* collapsed after a full page reload (proving the `localStorage`
  persistence actually works, not just the in-memory signal); the slash palette shows all 11 commands
  for a bare `/`, correctly filters to exactly `/replay` for `/rep`, and Enter completes it into the
  input as `/replay `; typing text with `Shift+Enter` produces a genuine `"line one\nline two"`
  textarea value; Minimize hides the output/input area entirely and Restore brings it back; Expand
  changes the computed `max-height`; free text with no leading slash starts a real AI PO conversation
  (a genuine Anthropic API call — first attempt raced ahead of a still-in-flight LLM response since
  the check fired at a fixed 2.5s delay with no in-flight-request wait, which surfaced as a false
  negative on that specific run; a second full run, giving the model more time, confirmed it fully);
  the red Reset button clears the transcript and prints the reset confirmation; the AppPreview header
  row shows zero overflow (`scrollWidth === clientWidth`) at a 900px viewport; and the ACME demo's
  cart correctly adds two items, removes one via its own Remove button, and empties via Clear Cart
  (confirmed by reading back the cart's own "no items yet" fallback text). One console message
  (`audit stream error TypeError: network error`) appeared, but only during the test script's own
  `page.reload()` step — the exact same pre-existing, unrelated `auditStore.ts` behavior already
  root-caused and documented in UOW-15's journal (no page-unload handling around its `fetch()`); not
  a regression from this UOW.

## Cleanup
Verification spun up throwaway servers on ports 5301 (the skill's own driver) and 5311-5312, plus
real `.codex/audits/`/`.codex/demos/`/`.codex/sessions/` runtime artifacts from both the `test:sse`
run and the Playwright passes — all deleted before finalizing, along with the two `*.tmp.mjs`
verification scripts.

## UOW-16 complete
All 3 Pass D requirement areas shipped: AgentZ CLI rebrand with AI-first slash-command routing, the
slash palette and multiline input, the guided onboarding banner and working window controls, and the
App Preview header/cart fixes — plus the consequence fix to the run-nemzilla-studio skill's own test
tooling.
