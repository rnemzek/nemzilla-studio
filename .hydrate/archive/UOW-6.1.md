=================== 💧 HYDRATE ARCHITECT DUMP [UOW-6.1] ===================

PROJECT: nemzilla-studio
DATE: 2026-09-11
UOW_ID: UOW-6.1

# 1. SCOPE & OBJECTIVES
Implement the Zip Code Location Provider & Geolocation Strategy for the generated TODO micro-app preview. The preview app must handle location detection via native HTML5 Geolocation API with a clean fallback to a user-configurable Zip Code modal/prompt (defaulting to San Francisco `94103` if unprovided). Location state must be exposed globally within the client micro-app context to pave the way for downstream region-aware suggestions.

# 2. FILE TOUCH BOUNDARIES
- **MODIFY:**
  - TODO Micro-App Generator / Template Modules (inject location state handling into generated code).
  - Preview UI / Preview Frame Header (add an active Zip Code / Location indicator badge and prompt trigger).
- **DO NOT TOUCH:**
  - Server SSE streaming contracts or Hono router definitions.

# 3. ACCEPTANCE CRITERIA
1. **Location Resolution:** On app startup, the micro-app requests HTML5 Geolocation permission. If granted, it resolves coordinates or displays city context; if denied/unavailable, it falls back to a Zip Code input prompt defaulting to `94103` (San Francisco, CA).
2. **UI Location Badge:** A subtle location chip (e.g., `📍 94103 (SF)` or `📍 Localized`) displays in the TODO micro-app header, allowing the user to tap and change their active zip code at any time.
3. **Context Binding:** Active location metadata (`{ zip: string, lat?: number, lng?: number, label: string }`) is saved to `localStorage` and attached to client-side task creation events.
4. **Verification Gate:** `npm test` passes cleanly with no regressions in generated app preview scripts.

# 4. IMPLEMENTATION & QUALITY INSTRUCTIONS
- Implement lightweight ESM-first location utility inside the TODO app template.
- Ensure zero external client dependencies are added.
- Run `npm test` and verify through browser preview inspection.
- Stage and commit working tree upon green test run.

========================================================================================
