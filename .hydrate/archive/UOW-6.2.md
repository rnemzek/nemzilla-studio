=================== 💧 HYDRATE ARCHITECT DUMP [UOW-6.2] ===================

PROJECT: nemzilla-studio
DATE: 2026-09-12
UOW_ID: UOW-6.2

# 1. SCOPE & OBJECTIVES
Implement real-time multi-device synchronization for the generated TODO micro-app using a lightweight room-based broadcast channel (e.g., standard WebSockets or SSE pub/sub adapter). When the mobile preview is launched via QR code, scanning the same QR code on a second device (or opening the preview URL in another window) connects both clients to the same room. Checking off, adding, or deleting tasks on one device immediately syncs state across all connected devices in real time.

# 2. FILE TOUCH BOUNDARIES
- **MODIFY:**
  - Hono server endpoints (`server.ts` / server routes to support a lightweight WebSocket or SSE pub/sub room route, e.g., `/api/sync/:roomId`).
  - TODO Micro-App Generator / Template Modules (inject real-time sync client listener and room ID parameter parsing into the micro-app runtime).
  - Preview UI / QR Code Modal (ensure the generated QR code URL includes the session/room ID parameter, e.g., `?room=todo-xxxx`).
- **DO NOT TOUCH:**
  - `locationProviderSnippet.ts` or existing zip code modal logic.

# 3. ACCEPTANCE CRITERIA
1. **Room Assignment:** Every TODO app preview session generates or assigns a unique `roomId`. The QR code modal renders a link containing this `roomId`.
2. **Real-Time Pub/Sub:** Opening the TODO preview link on two separate browser instances/devices connects both to the same pub/sub channel for that `roomId`.
3. **State Synchronization:** Task actions (`add`, `toggle`, `delete`) on Device A instantly broadcast a sync event and update the task list on Device B without requiring a full page refresh.
4. **Offline / Fallback Handling:** If the real-time channel is disconnected or unavailable, task actions continue to save to `localStorage` locally without throwing uncaught runtime errors.
5. **Verification Gate:** `npm test` passes cleanly with all suites green.

# 4. IMPLEMENTATION & QUALITY INSTRUCTIONS
- Keep server sync infrastructure lightweight within Hono (in-memory pub/sub or broadcast array keyed by `roomId` is sufficient for demo scope).
- Ensure client sync listener gracefully handles reconnects and initial state sync.
- Run `npm test` and verify multi-tab / mobile sync via preview URLs.
- Stage and commit working tree upon green test run.

========================================================================================
