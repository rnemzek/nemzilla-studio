# UOW-5.0: Executive Mobile-First Risk & Effort Charting

## Objective
Enhance `StackrynCockpitPanel.tsx` with mobile-responsive visual charts (e.g., System Readiness Distribution & Risk Density Bar/Donut) to give C-level executives an immediate visual overview on mobile screens before diving into the detailed risk matrix and Linear backlog payload.

## Acceptance Criteria
- [x] Add a visual chart component (SVG/CSS-based horizontal distribution bar or donut breakdown) inside `StackrynCockpitPanel.tsx`.
- [x] Render visual metrics for System Integration Readiness (e.g., API-Ready vs. Adapter Needed vs. EOL Legacy) and Risk Severity Breakdown.
- [x] Ensure full mobile-first responsiveness so the charts and Cockpit metrics scale cleanly on iPhone/mobile screens.
- [x] Maintain dynamic reactivity when custom files are uploaded via `FileUploadZone.tsx`.
- [x] Verify test suite passes (`npm test`).

## File Scope (as implemented)
- `src/components/StackrynCockpitPanel.tsx`
- `src/components/StackrynReadinessCharts.tsx` (new — not in the UOW's literal File Scope, which didn't anticipate a new component file, but kept the chart logic/markup out of the already-large panel component; covered by the `src/components/*` scope grant)

## Verification Command
npm test
