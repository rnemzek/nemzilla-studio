/**
 * UOW-6.2: the client-side multi-device sync listener injected into every
 * generated TODO micro-app (see swarmCodeSynthesizer.ts's
 * synthesizeItineraryApp and appGeneratorPrompt.ts's
 * buildUnifiedItinerarySnippet) — one shared block, kept separate from
 * locationProviderSnippet.ts per this UOW's own file boundary.
 *
 * Deliberately generic about `TASKS`' shape: both generators name their
 * task-state variable `TASKS` but structure it differently (a flat array of
 * `{id, completed, subItems}` vs. a `{category, details.checklist}` shape),
 * so this snippet only ever treats it as an opaque JSON blob to broadcast/
 * receive — the generator-specific `onSyncStateApplied()` function (defined
 * by each generator, called after a remote update lands) is what actually
 * knows how to re-render.
 *
 * Room resolution: reads `?room=` first, then falls back to parsing the
 * `/share/<slug>` path segment — both the query param the QR/share link
 * carries (see PublishModal.tsx) and the slug the `/share/:slug` route
 * itself already encodes resolve to the same identifier without any
 * server-side templating of the stored HTML. No match (e.g. the Studio's
 * own unpublished `/sandbox-frame` preview) means sync simply stays off —
 * the same "no room, no error" path as a genuinely dropped connection (see
 * AC 4: offline task actions still just work locally).
 */
export function buildTaskSyncScript(): string {
  return `
  var SYNC_ROOM_ID = (function () {
    try {
      var fromQuery = new URLSearchParams(window.location.search).get('room')
      if (fromQuery) return fromQuery
      var match = window.location.pathname.match(/\\/share\\/([a-z0-9-]+)/)
      return match ? match[1] : null
    } catch (e) {
      return null
    }
  })()

  var syncSource = null
  var lastSyncedJson = null

  function broadcastTaskState() {
    if (!SYNC_ROOM_ID) return
    try {
      var json = JSON.stringify(TASKS)
      if (json === lastSyncedJson) return
      lastSyncedJson = json
      fetch('/api/sync/' + encodeURIComponent(SYNC_ROOM_ID), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: TASKS }),
      }).catch(function () {})
    } catch (e) {
      // Offline/unreachable: the task action itself already happened above
      // (in-memory TASKS + this generator's own local persistence, if any) —
      // sync is best-effort and never blocks or throws past this point.
    }
  }

  function applyRemoteTaskState(remoteTasks) {
    if (remoteTasks === undefined || remoteTasks === null) return
    TASKS = remoteTasks
    lastSyncedJson = JSON.stringify(TASKS)
    onSyncStateApplied()
  }

  function initTaskSync() {
    if (!SYNC_ROOM_ID || typeof EventSource === 'undefined') return
    try {
      syncSource = new EventSource('/api/sync/' + encodeURIComponent(SYNC_ROOM_ID))
      syncSource.addEventListener('state', function (event) {
        try {
          var payload = JSON.parse(event.data)
          if (payload) applyRemoteTaskState(payload.tasks)
        } catch (e) {}
      })
      // Native EventSource auto-reconnects on drop; the server always
      // re-sends the room's current state as the first frame of a fresh
      // connection (see syncStream.ts), so a reconnect naturally re-syncs
      // without any extra client-side bookkeeping here.
      syncSource.onerror = function () {}
    } catch (e) {
      // No EventSource support / connection failed to even open — sync
      // stays off, everything else keeps working locally.
    }
  }
`
}
