=================== 💧 HYDRATE ARCHITECT DUMP [UOW-6.0] ===================

PROJECT: nemzilla-studio
DATE: 2026-09-11
UOW_ID: UOW-6.0

# 1. SCOPE & OBJECTIVES
Purge all remaining Order Entry (OE) domain assets, agent definitions, fixtures, and UI dropdown/toggle controls from `nemzilla-studio`. Re-architect the agent swarm topology into a dedicated, single-purpose TODO micro-app generation engine. Clean up terminal logging and audit ledger mock fixtures to strictly reference TODO domain artifacts.

# 2. FILE TOUCH BOUNDARIES
- **MODIFY:**
  - Active UI preset menus / domain switchers (e.g., domain selection controls, preset cookbooks).
  - Swarm topology orchestrator / configuration modules (remove `AI OE` node, enforce `PO -> Architect -> AI Vendor -> AI TODO -> Policy -> Lead Dev`).
  - Terminal log generators & audit ledger fixture mocks (replace catalog/HITL/CISO/RFP text streams with TODO schema and PWA manifest events).
- **DELETE / DEPRECATE:**
  - Any dedicated OE agent handlers or isolated OE prompt templates.
- **DO NOT TOUCH:**
  - Core Hono SSE streaming handlers or client preview rendering logic.

# 3. ACCEPTANCE CRITERIA
1. **UI Cleanliness:** No trace of "OE", "Order Entry", or OE preset options remains in the studio navigation, header, preset selector, or status indicators.
2. **Swarm Topology:** The visual agent node chain strictly renders: `PO` -> `Architect` -> `AI Vendor` -> `AI TODO` -> `Policy` -> `Lead Dev`.
3. **Audit Ledger & Terminal:** Running the TODO generator streams only TODO-related telemetry (e.g., `todo-schema.json`, `pwa-manifest.json`, local storage keys) and removes OE terms (`HITL ceiling`, `catalog items`, `ciso-constraints.txt`, `enterprise-rfp.pdf`).
4. **Verification Gate:** `npm test` passes cleanly with zero missing module errors or broken preset references.

# 4. IMPLEMENTATION & QUALITY INSTRUCTIONS
- Inspect workspace for all occurrences of `OE`, `AI OE`, `ciso-constraints`, `enterprise-rfp`, and `HITL`.
- Update the mock audit log generator to return domain-appropriate TODO fixtures.
- Execute `npm test` to verify test suite status.
- Stage and commit working tree upon green test run.

========================================================================================
