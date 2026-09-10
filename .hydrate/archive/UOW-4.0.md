# UOW-4.0: Stackryn Unified Ingest UX & Dynamic File Upload Integration

## Objective
Refine the Stackryn Modernization Cockpit UX by consolidating the Preset Cookbook controls into a single unified "Ingest Discovery Bundle" trigger that visually displays the three input formats (PDF, CSV, TXT), adding smooth auto-scroll focus to the dashboard panel upon pipeline completion, and introducing runtime file drag-and-drop capability to `StackrynCockpitPanel.tsx`.

## Acceptance Criteria
- [x] Update `CookbookDropdown.tsx` to replace the three separate preset item triggers with a single unified card trigger: **"Ingest Project Horizon Bundle"**, displaying visual tags for the multi-format inputs (`PDF RFP`, `CSV Matrix`, `TXT Constraints`). Clicking it runs all three presets through the ingest pipeline in turn.
- [x] Add smooth auto-scroll / focus logic (`element.scrollIntoView({ behavior: 'smooth' })`) so `StackrynCockpitPanel` scrolls into view whenever `stackrynDashboardStore`'s `latest` result changes (i.e. as soon as an ingestion completes).
- [x] Add a file dropzone / upload control (`FileUploadZone.tsx`, new) inside `StackrynCockpitPanel.tsx` supporting drag-and-drop (and click-to-browse) upload of `.pdf`, `.csv`, `.txt`, and `.json` files.
- [x] Extend `/api/stackryn/ingest` to support multipart/form-data file uploads (format inferred from the uploaded filename's extension), alongside the existing JSON preset body path, plus dynamic content-based risk evaluation for client-uploaded files (as opposed to the canned Project Horizon fixture findings).
- [x] Verify test suite passes (`npm test`). (18/18 — unchanged from UOW-3.0's 10 `test:stackryn` + 4 `test:sse`, since no existing test's request/fixture shape changed; manually verified the new multipart path live via curl.)

## File Scope (as implemented)
- `src/components/CookbookDropdown.tsx`
- `src/components/StackrynCockpitPanel.tsx`
- `src/components/FileUploadZone.tsx` (new — not in the UOW's literal File Scope, which didn't anticipate a new component file, but required by AC #3)
- `src/server/routes/stackrynIngest.ts`
- `src/server/services/stackrynGovernanceEngine.ts`
- `src/server/services/stackrynFormatParsers.ts` (outside literal File Scope — needed to add the `'json'` format and `inferFormatFromFilename()`)
- `src/lib/stackrynIngestClient.ts` (outside literal File Scope — needed `triggerStackrynFileUpload()` and the widened `format` union)

## Verification Command
npm test
