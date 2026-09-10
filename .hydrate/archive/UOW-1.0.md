# UOW-1.0: Hono Multi-Format Ingest API & Swarm SSE Integration

## Objective
Wire the Hono ingest API route (`/api/stackryn/ingest`) directly into NemZilla Studio's SSE Swarm event stream so multi-format ACME scoping requests stream live telemetry across `<SwarmCanvas/>` and record decisions to the Cryptographic Audit Ledger.

## Acceptance Criteria
- [x] Add `"test": "npm run test:sse"` to `package.json` scripts so `npm test` resolves successfully. (Extended to `"test:sse" && "test:stackryn"` once this UOW's own verification script existed — see Dev Journal.)
- [x] Create a Hono POST endpoint accepting format, filename, and payload. (`src/server/routes/stackrynIngest.ts`, not the spec's literal `src/routes/api/stackryn/ingest.ts` — see Architect Journal for why.)
- [x] Ingest payloads from `fixtures/stackryn/` (`.pdf.txt`, `.csv`, `.txt`) using `evaluateGovernance()`.
- [x] Broadcast execution steps (`PLANNING` -> `PARSING` -> `EVALUATING` -> `DONE`) over `/api/agent/stream` SSE stream.
- [x] Push evaluated `IngestedScopePayload` results to the Cryptographic Audit Ledger hash chain.
- [x] Verify test suite passes (`npm test`). (8/8 — see Dev Journal.)

## File Scope (as implemented — see Architect Journal for path deviations)
- `package.json`
- `src/server/routes/stackrynIngest.ts`
- `src/server/services/stackrynFormatParsers.ts`
- `src/server/services/stackrynGovernanceEngine.ts`
- `fixtures/stackryn/{sample.txt,sample.csv,sample.pdf.txt}`
- `scripts/verify-stackryn-ingest.ts`
- `.hydrate/CURRENT_UOW.md`

## Verification Command
npm test

## Note
`.hydrate/CURRENT_UOW.md` and `.hydrate/ROADMAP.md` were found corrupted at
session start (both byte-identical to the deleted root `ARCHITECTURE.md`,
with `session.json` independently confirming `uow.active: null`) — restored
`ARCHITECTURE.md` before this UOW's payload was supplied directly by the
Product Owner rather than through `CURRENT_UOW.md`.
