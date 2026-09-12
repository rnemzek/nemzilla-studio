/**
 * UOW-6.1: the client-side Zip Code / Geolocation provider injected into
 * every generated TODO micro-app (see swarmCodeSynthesizer.ts's
 * synthesizeItineraryApp and appGeneratorPrompt.ts's
 * buildUnifiedItinerarySnippet) — one shared block so both generators render
 * the identical badge/modal/behavior instead of drifting apart.
 */
export const DEFAULT_LOCATION_ZIP = '94103'
export const DEFAULT_LOCATION_LABEL = '94103 (SF)'

/** The header chip — placed next to `progress-badge` in each generator's own markup. */
export function buildLocationBadgeMarkup(): string {
  return `<button type="button" id="location-badge" class="whitespace-nowrap rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300 transition-all" title="Tap to change your zip code">📍 ${DEFAULT_LOCATION_LABEL}</button>`
}

/** The zip-entry prompt — a hidden overlay toggled by the badge and by a denied/unavailable geolocation request. Append once per generated app, anywhere inside the outer wrapper. */
export function buildLocationModalMarkup(): string {
  return `<div id="location-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-4">
  <div class="w-full max-w-xs rounded-lg border border-slate-800 bg-slate-900 p-4 text-slate-100">
    <h3 class="text-sm font-semibold">Set your zip code</h3>
    <p class="mt-1 text-xs text-slate-400">Used to localize suggestions. Defaults to San Francisco.</p>
    <input id="location-zip-input" type="text" inputmode="numeric" maxlength="10" placeholder="${DEFAULT_LOCATION_ZIP}" class="mt-3 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100" />
    <div class="mt-3 flex justify-end gap-2">
      <button type="button" id="location-modal-cancel" class="rounded px-2 py-1 text-xs text-slate-400 hover:text-slate-200">Cancel</button>
      <button type="button" id="location-modal-save" class="rounded bg-sky-500/20 px-2 py-1 text-xs font-medium text-sky-300 hover:bg-sky-500/30">Save</button>
    </div>
  </div>
</div>`
}

/**
 * The behavior: on load, tries `navigator.geolocation`; on denial/timeout/
 * absence falls back to the zip modal (pre-filled with the last saved zip,
 * defaulting to 94103). Active location is relayed to the parent (real
 * origin) via postMessage AND written to this document's own `localStorage`
 * — the same dual-path convention `buildUnifiedItinerarySnippet`'s
 * `persistState` already uses for itinerary checkbox state, since the
 * sandboxed iframe's own storage doesn't survive a reload but a standalone
 * `/share/:slug` page's does (see that function's doc comment).
 *
 * Call `initLocationProvider()` once at the bottom of the generated app's
 * script, and `attachLocationToTaskEvent(taskId, completed)` from each task
 * checkbox's `change` handler — this app has no "add task" UI (only
 * checkbox-toggle completion), so the checkbox event is the closest existing
 * stand-in for the "task creation event" the UOW asks to carry location
 * metadata on, ahead of any future region-aware task suggestions.
 */
export function buildLocationProviderScript(locationStateType: string, restoreLocationStateType: string): string {
  return `
  var LOCATION_STATE_TYPE = ${JSON.stringify(locationStateType)}
  var RESTORE_LOCATION_STATE_TYPE = ${JSON.stringify(restoreLocationStateType)}
  var LOCATION_STORAGE_KEY = 'nemzilla-location-state'
  var DEFAULT_LOCATION = { zip: ${JSON.stringify(DEFAULT_LOCATION_ZIP)}, lat: null, lng: null, label: ${JSON.stringify(DEFAULT_LOCATION_LABEL)} }
  var activeLocation = DEFAULT_LOCATION

  function renderLocationBadge() {
    var badge = document.getElementById('location-badge')
    if (!badge) return
    badge.textContent = '📍 ' + (activeLocation.label || activeLocation.zip || 'Localized')
  }

  function persistLocation() {
    try { window.parent.postMessage({ type: LOCATION_STATE_TYPE, state: activeLocation }, '*') } catch (e) {}
    try { localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(activeLocation)) } catch (e) {}
  }

  function setLocation(next) {
    activeLocation = next
    renderLocationBadge()
    persistLocation()
  }

  function loadOwnLocation() {
    try {
      var raw = localStorage.getItem(LOCATION_STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      return null
    }
  }

  function openLocationModal() {
    var modal = document.getElementById('location-modal')
    var input = document.getElementById('location-zip-input')
    if (!modal || !input) return
    input.value = activeLocation.zip || ''
    modal.classList.remove('hidden')
    modal.classList.add('flex')
  }

  function closeLocationModal() {
    var modal = document.getElementById('location-modal')
    if (!modal) return
    modal.classList.add('hidden')
    modal.classList.remove('flex')
  }

  function requestGeolocation() {
    if (!('geolocation' in navigator)) {
      openLocationModal()
      return
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        setLocation({ zip: null, lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Localized' })
      },
      function () {
        openLocationModal()
      },
      { timeout: 5000 },
    )
  }

  function initLocationProvider() {
    var restored = loadOwnLocation()
    if (restored) {
      activeLocation = restored
      renderLocationBadge()
    } else {
      renderLocationBadge()
      requestGeolocation()
    }

    var badge = document.getElementById('location-badge')
    if (badge) badge.addEventListener('click', openLocationModal)
    var cancelBtn = document.getElementById('location-modal-cancel')
    if (cancelBtn) cancelBtn.addEventListener('click', closeLocationModal)
    var saveBtn = document.getElementById('location-modal-save')
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var input = document.getElementById('location-zip-input')
        var zip = (input && input.value ? input.value.trim() : '') || DEFAULT_LOCATION.zip
        setLocation({ zip: zip, lat: null, lng: null, label: zip === DEFAULT_LOCATION.zip ? DEFAULT_LOCATION.label : zip })
        closeLocationModal()
      })
    }

    window.addEventListener('message', function (event) {
      if (!event.data || event.data.type !== RESTORE_LOCATION_STATE_TYPE || !event.data.state) return
      activeLocation = event.data.state
      renderLocationBadge()
    })
  }

  function attachLocationToTaskEvent(taskId, completed) {
    try {
      document.dispatchEvent(new CustomEvent('nemzilla:task-event', {
        detail: { taskId: taskId, completed: completed, location: activeLocation },
      }))
    } catch (e) {}
  }
`
}
