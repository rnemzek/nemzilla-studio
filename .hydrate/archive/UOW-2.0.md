# UOW-2.0: Stackryn UI Preset Recipe & Command Center Trigger Integration

## Objective
Register a new Stackryn preset recipe inside `.codex/demos/acme-stackryn.json` and add trigger controls to the `<CommandCenterDrawer/>` (or primary UI header controls) so users can trigger multi-format scoping ingestion runs directly from the NemZilla Studio interface and watch the Swarm Canvas stream telemetry live.

## Acceptance Criteria
- [x] Create `.codex/demos/acme-stackryn.json` defining the preset state (mapping `fixtures/stackryn/` ACME order files: PDF, CSV, TXT). (Exists on disk — `.codex/demos/` is fully `.gitignore`d, so not committed, matching every other file already in that directory.)
- [x] Register the Stackryn preset in `src/lib/presetStore.ts` (or equivalent recipe store) so it appears in the preset selector/modal. (`src/lib/cookbookPresets.ts`'s new `STACKRYN_INGEST_PRESETS` — see Architect Journal for why `CookbookDropdown.tsx`/`cookbookPresets.ts`, not `CommandCenterDrawer.tsx`/`presetStore.ts`, are this repo's actual equivalent.)
- [x] Add a "Stackryn Scope Ingestion" card / trigger action in `src/components/CommandCenterDrawer.tsx` (or primary UI controls container). (`src/components/CookbookDropdown.tsx` — new section, 3 buttons.)
- [x] Ensure clicking the trigger fires `POST /api/stackryn/ingest` with the selected fixture format and renders live agent step updates (`PLANNING` -> `PARSING` -> `EVALUATING` -> `DONE`) on `<SwarmCanvas/>`. (Confirmed via headless-browser click-through: inline status line + a "Stackryn Ingest" node reaching "done" on the live Swarm Canvas.)
- [x] Verify test suite passes (`npm test`). (8/8 — unchanged from UOW-1.0, this UOW touched no backend contract.)

## File Scope (as implemented — see Architect Journal for deviations)
- `.codex/demos/acme-stackryn.json`
- `src/lib/cookbookPresets.ts`
- `src/lib/stackrynIngestClient.ts` (new)
- `src/components/CookbookDropdown.tsx`
- `src/lib/swarmStore.ts` (2 small edits — required for the SSE states this UOW's trigger actually emits to render on the canvas at all)
- `src/server/services/sessionSerializer.ts` (1 small defensive edit — prevents `acme-stackryn.json` from crashing the existing saved-runs list)

## Verification Command
npm test
