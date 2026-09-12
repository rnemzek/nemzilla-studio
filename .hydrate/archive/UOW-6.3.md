=================== 💧 HYDRATE ARCHITECT DUMP [UOW-6.3] ===================

PROJECT: nemzilla-studio
DATE: 2026-09-12
UOW_ID: UOW-6.3

# 1. SCOPE & OBJECTIVES
Implement the Region-Aware AI "Task Assistant" Agent pipeline for the TODO micro-app runtime. When a user adds a task (e.g., "Buy filet mignon" or "Watch SF Giants game"), an asynchronous background call triggers a lightweight assistant agent endpoint that evaluates the task text alongside the active location context (`zip` / `lat/lng`). The assistant returns structured, location-relevant contextual suggestions (local store sales, event start times, or regional tips) that display as actionable suggestion chips within the task item.

# 2. FILE TOUCH BOUNDARIES
- **MODIFY:**
  - Hono server endpoints (add `POST /api/todo-assistant` endpoint using `@anthropic-ai/sdk` / fast LLM call with a streamlined system prompt).
  - TODO Micro-App Generator / Template Modules (inject asynchronous task assistant listener snippet into task creation flow).
  - TODO Micro-App UI (add UI rendering for suggestion chips under tasks, with a "Tap to apply / append note" interaction).
- **DO NOT TOUCH:**
  - `syncRoomManager.ts` or existing SSE sync routes.

# 3. ACCEPTANCE CRITERIA
1. **Asynchronous Trigger:** Adding a new task fires a non-blocking `POST /api/todo-assistant` request containing `{ task: string, zip: string, locationLabel?: string }`.
2. **Contextual Suggestion Generation:** The assistant endpoint returns a concise JSON suggestion payload (e.g., `{ suggestion: "Harris Teeter has Filet Mignon on sale for $29.99/lb today", actionText: "Add deal note" }`) or `null` if no relevant regional context applies.
3. **Interactive Chip UI:** Relevant suggestions render smoothly as a subtle, tapable badge/chip under the specific task in the mobile UI.
4. **Action Execution:** Tapping the suggestion chip appends the deal/tip details directly into the task's note or details field without altering the original task title.
5. **Non-Blocking Resilience:** Network timeouts or API key omissions fail gracefully without blocking local task creation or real-time sync.
6. **Verification Gate:** `npm test` passes cleanly across all test suites.

# 4. IMPLEMENTATION & QUALITY INSTRUCTIONS
- Implement `POST /api/todo-assistant` in Hono using structured JSON outputs.
- Inject a lightweight client fetch listener into the TODO app template.
- Test both relevant tasks (e.g., grocery items, sports games) and generic tasks (e.g., "Clean desk") to verify fallback handling.
- Run `npm test` and verify via browser preview.
- Stage and commit working tree upon green test run.

========================================================================================
