import { ACTION_KIT_REGISTRY } from '../../lib/actionKit.ts'
import type { UnifiedItineraryPayload } from '../../types/itinerary.ts'
import { buildLocationBadgeMarkup, buildLocationModalMarkup, buildLocationProviderScript } from '../services/locationProviderSnippet.ts'

// Mirrors SANDBOX_MESSAGE.itineraryState/restoreItineraryState in sandboxTemplate.ts.
const ITINERARY_STATE_MESSAGE_TYPE = 'nemzilla:sandbox-itinerary-state'
const RESTORE_ITINERARY_STATE_MESSAGE_TYPE = 'nemzilla:sandbox-restore-itinerary-state'
// Mirrors SANDBOX_MESSAGE.locationState/restoreLocationState in sandboxTemplate.ts.
const LOCATION_STATE_MESSAGE_TYPE = 'nemzilla:sandbox-location-state'
const RESTORE_LOCATION_STATE_MESSAGE_TYPE = 'nemzilla:sandbox-restore-location-state'

/** Mirrors swarmCodeSynthesizer.ts's escapeHtml/toInlineJson — duplicated rather than imported since src/server and src/lib sit in separate tsconfig projects. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function toInlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export const SCENARIOS = ['today-itinerary', 'default-sandbox'] as const
export type ScenarioId = (typeof SCENARIOS)[number]

/**
 * Real system-prompt text for the AgentZ Dual-Engine Architecture (see
 * .codex/AGENTZ-STUDIO-SDK.md). No model is wired to consume this today —
 * the Dev agent step uses `generateAppSnippet` below instead, matching this
 * project's existing fully-simulated pipeline (see agentStream.ts). This is
 * written as real, usable scaffolding for whenever a live model is plugged
 * into the Dev stage, not decorative text.
 */
export function buildAppGeneratorSystemPrompt(): string {
  const actionKitDocs = ACTION_KIT_REGISTRY.map(
    (endpoint) =>
      `  - ${endpoint.label} (${endpoint.id}): ${endpoint.method} ${endpoint.baseUrl}\n` +
      `    ${endpoint.description}\n` +
      `    Example: ${endpoint.sampleQuery}`,
  ).join('\n')

  return `You are the Dev agent inside AgentZ Studio's Sandbox. Generate a single-file
HTML/CSS/Tailwind/JS micro-application that renders inside an isolated,
sandboxed iframe (sandbox="allow-scripts", no allow-same-origin — the app
cannot read the host site's cookies or storage).

Output ONLY the body-level markup + a single trailing <script> tag. Do not
emit <html>, <head>, or <!doctype> — the runtime wraps your snippet with its
own envelope (Tailwind CDN, Inter font, and a window-level error boundary).

Every generated app must be built from the Dual-Engine Architecture:

Engine A — Synthetic State & Policy
  - In-memory JS state or localStorage for entities (catalogs, orders, tasks).
  - A rule interceptor evaluating explicit conditions before committing an
    action (e.g. "if (total <= 100) autoApprove(); else requireHITL()").
  - A virtual notification drawer rendered in the UI for simulated
    email/SMS/push feedback — never call a real notification API.

Engine B — Live Action Kit
  - Plain fetch() calls to pre-validated, zero-auth, CORS-friendly public
    APIs only (registry below). Always guard with .catch() and fall back to
    the endpoint's fallbackMock data so the app never renders empty offline.

Available Action Kit endpoints:
${actionKitDocs}

Respond with working code only — no prose, no markdown fences.`
}

export function matchScenario(userPrompt: string): ScenarioId {
  const normalized = userPrompt.trim().toLowerCase()
  if (normalized.includes('itinerary') || normalized.includes('today') || normalized.includes('todo') || normalized.includes('task')) {
    return 'today-itinerary'
  }
  return 'default-sandbox'
}

/**
 * Pass E "Plan C": the default seed payload for the Unified Itinerary
 * Synthesizer — real content for all three merged domains (errand, culinary,
 * entertainment), not placeholder text. The recipe's `externalUrl` is the
 * real Food.com page for this dish (supplied directly rather than guessed).
 */
const DEFAULT_UNIFIED_ITINERARY: UnifiedItineraryPayload = {
  slug: 'today',
  title: 'My TODAY Itinerary',
  date: new Date().toISOString().slice(0, 10),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  tasks: [
    {
      id: 'errand-lowes',
      category: 'errand',
      title: "Get mulch from Lowe's",
      time: '2:00 PM',
      location: "Lowe's Home Improvement",
    },
    {
      id: 'errand-jiffylube',
      category: 'errand',
      title: 'Jiffy Lube oil change',
      time: '3:30 PM',
      location: 'Jiffy Lube',
    },
    {
      id: 'errand-groceries',
      category: 'errand',
      title: 'Get Groceries',
      time: '8:00 AM',
      details: {
        checklist: [
          { id: 'grocery-dog-treats', text: 'Dog treats', completed: false },
          { id: 'grocery-cheese', text: 'Cheese', completed: false },
          { id: 'grocery-yogurt', text: 'Yogurt', completed: false },
        ],
      },
    },
    {
      id: 'culinary-pecan-chicken-salad',
      category: 'culinary',
      title: 'Paula Deen Pecan Chicken Salad',
      time: '5:00 PM',
      details: {
        externalUrl: 'https://www.food.com/recipe/paula-deens-pecan-chicken-salad-377918',
        checklist: [
          { id: 'ing-chicken', text: 'Cooked chicken, chopped', completed: false },
          { id: 'ing-pecans', text: 'Toasted pecans, chopped', completed: false },
          { id: 'ing-celery', text: 'Celery, diced', completed: false },
          { id: 'ing-mayo', text: 'Mayonnaise', completed: false },
          { id: 'ing-onion', text: 'Green onions', completed: false },
          { id: 'ing-lemon', text: 'Lemon juice', completed: false },
          { id: 'ing-seasoning', text: 'Salt & pepper', completed: false },
        ],
      },
    },
    {
      id: 'entertainment-tonight',
      category: 'entertainment',
      title: "Tonight's Game",
      time: '7:05 PM',
      details: {
        streamingProvider: 'MASN, YouTube TV',
        notes: 'Live matchup fetched from the MLB Stats API when available.',
      },
    },
  ],
}

/**
 * Synthesizes a `UnifiedItineraryPayload` (errands + culinary + entertainment)
 * into one TODO List micro-app — this platform's single supported
 * app-generation domain (see UOW-6.0). Reuses this project's established
 * single-file HTML/Tailwind/vanilla-JS shape (no framework inside the
 * sandbox, matches every other scenario).
 *
 * All payload text is HTML-escaped before being embedded — this function is
 * a general synthesizer, not just a static template, so (unlike a hardcoded
 * const) it may eventually be fed AI/PO-derived content the same way
 * `swarmCodeSynthesizer.ts`'s synthesizer already treats interview data as
 * untrusted.
 */
function buildUnifiedItinerarySnippet(payload: UnifiedItineraryPayload): string {
  const safeTitle = escapeHtml(payload.title)
  const escapedPayload: UnifiedItineraryPayload = {
    ...payload,
    tasks: payload.tasks.map((task) => ({
      ...task,
      title: escapeHtml(task.title),
      location: task.location ? escapeHtml(task.location) : task.location,
      details: task.details
        ? {
            ...task.details,
            externalUrl: task.details.externalUrl ? escapeHtml(task.details.externalUrl) : task.details.externalUrl,
            streamingProvider: task.details.streamingProvider ? escapeHtml(task.details.streamingProvider) : task.details.streamingProvider,
            notes: task.details.notes ? escapeHtml(task.details.notes) : task.details.notes,
            checklist: task.details.checklist?.map((item) => ({ ...item, text: escapeHtml(item.text) })),
          }
        : task.details,
    })),
  }
  const tasksJson = toInlineJson(escapedPayload.tasks)

  return `<div class="min-h-screen bg-slate-950 p-6 text-slate-100">
  <div class="mx-auto max-w-3xl">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-bold">✨ ${safeTitle}</h1>
      <div class="flex flex-wrap items-center gap-2">
        ${buildLocationBadgeMarkup()}
        <span id="progress-badge" class="whitespace-nowrap rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 transition-all">0/0 Completed</span>
      </div>
    </div>
    <p class="mt-1 text-sm text-slate-400">Unified Itinerary Synthesizer — errands, dinner, and tonight's entertainment in one plan.</p>

    <div class="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Today's Errands</h2>
      <ul id="errand-list" class="mt-2 space-y-2 text-sm"></ul>
    </div>

    <div class="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Tonight's Dinner</h2>
      <div id="recipe-header" class="mt-2 text-sm"></div>
      <ul id="recipe-checklist" class="mt-3 space-y-2 text-sm"></ul>
    </div>

    <div class="mt-6 rounded-lg border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-800 p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Evening Entertainment</h2>
      <p id="entertainment-banner" class="mt-2 text-sm text-slate-300">Loading tonight's matchup…</p>
    </div>
  </div>
</div>
${buildLocationModalMarkup()}
<script>
  var TASKS = ${tasksJson}
  var ITINERARY_STATE_TYPE = '${ITINERARY_STATE_MESSAGE_TYPE}'
  var RESTORE_ITINERARY_STATE_TYPE = '${RESTORE_ITINERARY_STATE_MESSAGE_TYPE}'

  function findChecklistItem(id) {
    for (var i = 0; i < TASKS.length; i++) {
      var t = TASKS[i]
      if (t.id === id) return t
      if (t.details && t.details.checklist) {
        for (var j = 0; j < t.details.checklist.length; j++) {
          if (t.details.checklist[j].id === id) return t.details.checklist[j]
        }
      }
    }
    return null
  }

  function collectState() {
    var state = {}
    TASKS.forEach(function (t) {
      if (t.category === 'errand') state[t.id] = !!t.completed
      if (t.details && t.details.checklist) {
        t.details.checklist.forEach(function (ci) { state[ci.id] = !!ci.completed })
      }
    })
    return state
  }

  var LOCAL_STORAGE_KEY = 'nemzilla-itinerary-state'

  // This same generated document runs in two different contexts, and needs a
  // different persistence path in each:
  //  - Embedded in the Studio's sandboxed preview iframe (sandbox="allow-scripts",
  //    no allow-same-origin): the document gets a fresh opaque origin every
  //    load, so anything written to ITS OWN localStorage is already gone next
  //    time — relaying through the parent (a real, stable origin; see
  //    sandboxStore.ts) is the only way that actually persists there.
  //  - Opened standalone as a published /share/:slug page: there is no
  //    parent to relay to (window.parent === window), but this IS a normal,
  //    real origin now, so its own localStorage works completely normally.
  // Doing both, each wrapped so a failure in one never blocks the other, is
  // correct in both contexts: the postMessage silently goes nowhere when
  // standalone (nothing listens to a message a page sends itself), and the
  // direct localStorage write silently no-ops (or occasionally throws, in
  // browsers that reject storage access from an opaque origin) when sandboxed.
  function persistState() {
    var state = collectState()
    try {
      window.parent.postMessage({ type: ITINERARY_STATE_TYPE, state: state }, '*')
    } catch (e) {}
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state))
    } catch (e) {}
  }

  function applyState(saved) {
    if (!saved) return
    TASKS.forEach(function (t) {
      if (saved[t.id] !== undefined) t.completed = !!saved[t.id]
      if (t.details && t.details.checklist) {
        t.details.checklist.forEach(function (ci) {
          if (saved[ci.id] !== undefined) ci.completed = !!saved[ci.id]
        })
      }
    })
  }

  function loadOwnLocalStorage() {
    try {
      var raw = localStorage.getItem(LOCAL_STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      return null
    }
  }

  // Progress badge covers every checkable item across the whole itinerary
  // (errands + recipe ingredients) — one live "3/5 Completed" readout rather
  // than a separate counter per section, so it reads as a single plan.
  function updateProgressBadge() {
    var total = 0
    var completed = 0
    TASKS.forEach(function (t) {
      if (t.category === 'errand') {
        total += 1
        if (t.completed) completed += 1
      }
      if (t.details && t.details.checklist) {
        t.details.checklist.forEach(function (ci) {
          total += 1
          if (ci.completed) completed += 1
        })
      }
    })
    var badge = document.getElementById('progress-badge')
    if (badge) badge.textContent = completed + '/' + total + ' Completed'
  }

  function completionLabelClass(isCompleted) {
    return isCompleted ? 'transition-all line-through opacity-50' : 'transition-all'
  }

  function renderErrands() {
    var list = document.getElementById('errand-list')
    list.innerHTML = ''
    TASKS.filter(function (t) { return t.category === 'errand' }).forEach(function (t) {
      var li = document.createElement('li')
      var meta = t.time ? ' <span class="text-slate-500">(' + t.time + (t.location ? ' · ' + t.location : '') + ')</span>' : ''
      var checklist = (t.details && t.details.checklist) || []
      var subItems = checklist.length
        ? '<ul class="mt-1.5 ml-6 space-y-1">' + checklist.map(function (ci) {
            return '<li class="flex items-center gap-2">' +
              '<input type="checkbox" id="' + ci.id + '" class="h-3.5 w-3.5 rounded border-slate-700 bg-slate-800"' + (ci.completed ? ' checked' : '') + ' />' +
              '<label for="' + ci.id + '" class="' + completionLabelClass(ci.completed) + ' text-slate-300">' + ci.text + '</label>' +
              '</li>'
          }).join('') + '</ul>'
        : ''
      li.innerHTML = '<div class="flex items-center gap-2">' +
        '<input type="checkbox" id="' + t.id + '" class="h-4 w-4 rounded border-slate-700 bg-slate-800"' + (t.completed ? ' checked' : '') + ' />' +
        '<label for="' + t.id + '" class="' + completionLabelClass(t.completed) + '">' + t.title + meta + '</label>' +
        '</div>' + subItems
      list.appendChild(li)
    })
    Array.prototype.forEach.call(list.querySelectorAll('input'), function (input) {
      input.addEventListener('change', function (e) {
        var t = findChecklistItem(e.target.id)
        if (t) t.completed = e.target.checked
        renderErrands()
        updateProgressBadge()
        persistState()
        attachLocationToTaskEvent(e.target.id, e.target.checked)
      })
    })
  }

  function renderRecipe() {
    var recipeTask = TASKS.filter(function (t) { return t.category === 'culinary' })[0]
    var header = document.getElementById('recipe-header')
    var list = document.getElementById('recipe-checklist')
    if (!recipeTask) {
      header.innerHTML = '<p class="text-slate-500">No dinner planned yet.</p>'
      return
    }

    var ingredients = (recipeTask.details && recipeTask.details.checklist) || []
    var haveCount = ingredients.filter(function (i) { return i.completed }).length
    var readyBanner = ingredients.length > 0 && haveCount === ingredients.length
      ? '<p class="mt-1 text-xs font-medium text-emerald-400">✅ Ready to cook!</p>'
      : ''
    header.innerHTML = '<p class="font-medium">' + recipeTask.title + '</p>' +
      (recipeTask.details && recipeTask.details.externalUrl
        ? '<a href="' + recipeTask.details.externalUrl + '" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:underline">🔗 View full recipe</a>'
        : '') +
      readyBanner

    list.innerHTML = ''
    ingredients.forEach(function (ing) {
      var li = document.createElement('li')
      li.className = 'flex items-center gap-2'
      li.innerHTML = '<input type="checkbox" id="' + ing.id + '" class="h-4 w-4 rounded border-slate-700 bg-slate-800"' + (ing.completed ? ' checked' : '') + ' />' +
        '<label for="' + ing.id + '" class="' + completionLabelClass(ing.completed) + '">' + ing.text + '</label>'
      list.appendChild(li)
    })
    Array.prototype.forEach.call(list.querySelectorAll('input'), function (input) {
      input.addEventListener('change', function (e) {
        var item = findChecklistItem(e.target.id)
        if (item) item.completed = e.target.checked
        renderRecipe()
        updateProgressBadge()
        persistState()
        attachLocationToTaskEvent(e.target.id, e.target.checked)
      })
    })
  }

  var entertainmentTask = TASKS.filter(function (t) { return t.category === 'entertainment' })[0]

  function renderEntertainment(matchup) {
    var el = document.getElementById('entertainment-banner')
    var providers = entertainmentTask && entertainmentTask.details ? entertainmentTask.details.streamingProvider : ''
    var time = entertainmentTask ? entertainmentTask.time : ''
    el.innerHTML = '<span class="font-medium">' + matchup + '</span>' +
      (time ? ' <span class="text-slate-400">— ' + time + '</span>' : '') +
      (providers ? '<br><span class="text-slate-400">📺 ' + providers + '</span>' : '')
  }

  fetch('https://statsapi.mlb.com/api/v1/schedule?sportId=1')
    .then(function (r) { return r.json() })
    .then(function (data) {
      var game = data.dates && data.dates[0] && data.dates[0].games && data.dates[0].games[0]
      var matchup = game
        ? game.teams.away.team.name + ' @ ' + game.teams.home.team.name
        : (entertainmentTask ? entertainmentTask.title : "Tonight's Game")
      renderEntertainment(matchup)
    })
    .catch(function () {
      renderEntertainment(entertainmentTask ? entertainmentTask.title : "Tonight's Game")
    })

  // Parent -> child restore, sent once after this document confirms it has
  // rendered (see sandboxStore.ts) — only ever arrives when embedded in the
  // Studio's sandbox iframe; a standalone published page has no parent to
  // send it, which is fine, since loadOwnLocalStorage() below already
  // covers that case directly.
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== RESTORE_ITINERARY_STATE_TYPE) return
    applyState(event.data.state)
    renderErrands()
    renderRecipe()
    updateProgressBadge()
  })

  // Covers the standalone /share/:slug case (a real origin, no parent) —
  // harmlessly finds nothing yet when embedded in the sandbox iframe, since
  // that context's own localStorage never actually persisted across the
  // reload that just happened (see the comment on persistState() above).
  applyState(loadOwnLocalStorage())
${buildLocationProviderScript(LOCATION_STATE_MESSAGE_TYPE, RESTORE_LOCATION_STATE_MESSAGE_TYPE)}
  renderErrands()
  renderRecipe()
  updateProgressBadge()
  renderEntertainment(entertainmentTask ? entertainmentTask.title : "Tonight's Game")
  initLocationProvider()
</script>`
}

const DEFAULT_SANDBOX_SNIPPET = `<div class="flex min-h-screen items-center justify-center bg-slate-950 p-8">
  <div class="max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 text-center shadow-xl">
    <h1 class="text-xl font-semibold text-white">Default Sandbox</h1>
    <p class="mt-2 text-sm text-slate-400">
      Try a prompt containing "todo" or "itinerary" to generate the AgentZ Studio TODO List
      micro-app demo.
    </p>
  </div>
</div>`

export interface GeneratedApp {
  scenario: ScenarioId
  code: string
}

export function generateAppSnippet(userPrompt: string, _sessionId: string): GeneratedApp {
  const scenario = matchScenario(userPrompt)
  switch (scenario) {
    case 'today-itinerary':
      return { scenario, code: buildUnifiedItinerarySnippet(DEFAULT_UNIFIED_ITINERARY) }
    default:
      return { scenario, code: DEFAULT_SANDBOX_SNIPPET }
  }
}
