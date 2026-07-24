import { ACTION_KIT_REGISTRY } from '../../lib/actionKit.ts'
import { resolveOrderThreshold, SYSTEM_CEILING, type PolicyCheckResult } from '../services/policyEngine.ts'
import type { UnifiedItineraryPayload } from '../../types/itinerary.ts'

// Mirrors SANDBOX_MESSAGE.order in src/lib/sandboxTemplate.ts — see
// swarmCodeSynthesizer.ts for the same duplicated-constant pattern
// (src/server and src/lib sit in separate tsconfig projects).
const ORDER_MESSAGE_TYPE = 'nemzilla:sandbox-order-decision'
// Mirrors SANDBOX_MESSAGE.itineraryState/restoreItineraryState in sandboxTemplate.ts.
const ITINERARY_STATE_MESSAGE_TYPE = 'nemzilla:sandbox-itinerary-state'
const RESTORE_ITINERARY_STATE_MESSAGE_TYPE = 'nemzilla:sandbox-restore-itinerary-state'

/** Mirrors swarmCodeSynthesizer.ts's escapeHtml/toInlineJson — duplicated rather than imported for the same tsconfig-project-boundary reason as ORDER_MESSAGE_TYPE above. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function toInlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export const SCENARIOS = ['acme-order', 'today-itinerary', 'b2b-lead-scoring', 'default-sandbox'] as const
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
  if (normalized.includes('acme') || normalized.includes('order')) return 'acme-order'
  if (normalized.includes('itinerary') || normalized.includes('today')) return 'today-itinerary'
  if (normalized.includes('lead') || normalized.includes('b2b') || normalized.includes('scoring')) return 'b2b-lead-scoring'
  return 'default-sandbox'
}

function buildAcmeOrderSnippet(autoApproveCeiling: number, denyCeiling: number, sessionId: string): string {
  return `<div class="min-h-screen bg-slate-950 p-6 text-slate-100">
  <div class="mx-auto max-w-2xl">
    <h1 class="text-2xl font-bold">ACME Corp — Order Entry &amp; Approval</h1>
    <p class="mt-1 text-sm text-slate-400">Engine A: synthetic catalog, in-cart state, and a policy interceptor.</p>
    <p class="mt-1 text-xs text-slate-500">Governance: auto-approve &le; $${autoApproveCeiling} &middot; HITL up to $${denyCeiling} &middot; auto-deny above $${denyCeiling} (system ceiling).</p>

    <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3" id="catalog"></div>

    <div class="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Current Order</h2>
      <ul id="cart" class="mt-2 space-y-1 text-sm"></ul>
      <div class="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
        <span class="text-sm text-slate-400">Total</span>
        <span id="total" class="text-lg font-semibold">$0.00</span>
      </div>
      <div class="mt-4 flex gap-2">
        <button id="submit" class="flex-1 rounded-md bg-emerald-500 px-4 py-2 font-medium text-slate-950 hover:bg-emerald-400">
          Submit Order
        </button>
        <button id="clear-cart" class="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:border-red-500/50 hover:text-red-300">
          Clear Cart
        </button>
      </div>
    </div>

    <div id="hitl" class="mt-4 hidden rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <p class="text-sm font-medium text-amber-300">Supervisor HITL approval required — order between $${autoApproveCeiling} and $${denyCeiling}.</p>
      <div class="mt-3 flex gap-2">
        <button id="approve" class="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950">Approve</button>
        <button id="deny" class="rounded-md bg-red-500/80 px-3 py-1.5 text-sm font-medium text-white">Deny</button>
      </div>
    </div>

    <div class="mt-6">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Virtual Notification Drawer</h2>
      <ul id="notifications" class="mt-2 space-y-2 text-sm text-slate-300"></ul>
    </div>
  </div>
</div>
<script>
  var PRODUCTS = [
    { id: 'tnt', name: 'ACME TNT (1 Case)', price: 40 },
    { id: 'doll', name: 'ACME Blowup Doll', price: 65 },
    { id: 'tunnel', name: 'ACME Fake Tunnel Painting', price: 420 },
  ]
  var SESSION_ID = ${JSON.stringify(sessionId)}
  var AUTO_APPROVE_CEILING = ${autoApproveCeiling}
  var DENY_CEILING = ${denyCeiling}
  var cart = []
  var orderCounter = 99

  function postOrderEvent(decision, total) {
    try {
      window.parent.postMessage({ type: '${ORDER_MESSAGE_TYPE}', sessionId: SESSION_ID, total: total, decision: decision }, '*')
    } catch (e) {}
  }

  function renderCatalog() {
    var catalog = document.getElementById('catalog')
    catalog.innerHTML = PRODUCTS.map(function (p) {
      return '<button data-id="' + p.id + '" class="add-btn rounded-lg border border-slate-800 bg-slate-900 p-3 text-left hover:border-emerald-500/60">' +
        '<div class="font-medium">' + p.name + '</div>' +
        '<div class="text-sm text-slate-400">$' + p.price.toFixed(2) + '</div></button>'
    }).join('')
    Array.prototype.forEach.call(catalog.querySelectorAll('.add-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var product = PRODUCTS.filter(function (p) { return p.id === btn.dataset.id })[0]
        cart.push(product)
        renderCart()
      })
    })
  }

  function renderCart() {
    var list = document.getElementById('cart')
    list.innerHTML = cart.length
      ? cart.map(function (p, i) {
          return '<li class="flex items-center justify-between gap-2">' +
            '<span>' + p.name + '</span>' +
            '<span class="flex items-center gap-2">' +
              '<span>$' + p.price.toFixed(2) + '</span>' +
              '<button data-index="' + i + '" class="remove-btn text-xs text-red-400 hover:text-red-300">Remove</button>' +
            '</span></li>'
        }).join('')
      : '<li class="text-slate-500">No items yet — add something from the catalog.</li>'
    var total = cart.reduce(function (sum, p) { return sum + p.price }, 0)
    document.getElementById('total').textContent = '$' + total.toFixed(2)
    Array.prototype.forEach.call(list.querySelectorAll('.remove-btn'), function (btn) {
      btn.addEventListener('click', function () {
        cart.splice(Number(btn.dataset.index), 1)
        renderCart()
      })
    })
  }

  function notify(message) {
    var list = document.getElementById('notifications')
    var li = document.createElement('li')
    li.className = 'rounded-md border border-slate-800 bg-slate-900 px-3 py-2'
    li.textContent = message
    list.insertBefore(li, list.firstChild)
  }

  function shipOrder() {
    orderCounter += 1
    notify('Email: Order shipped — tracking #ACME-' + orderCounter)
  }

  document.getElementById('submit').addEventListener('click', function () {
    var total = cart.reduce(function (sum, p) { return sum + p.price }, 0)
    if (cart.length === 0) return
    if (total <= AUTO_APPROVE_CEILING) {
      notify('Policy: total $' + total.toFixed(2) + ' <= $' + AUTO_APPROVE_CEILING + ' — auto-approved.')
      postOrderEvent('auto_approved', total)
      shipOrder()
    } else if (total <= DENY_CEILING) {
      postOrderEvent('hitl_pending', total)
      document.getElementById('hitl').classList.remove('hidden')
    } else {
      notify('Policy: total $' + total.toFixed(2) + ' > $' + DENY_CEILING + ' — auto-denied.')
      postOrderEvent('auto_denied', total)
    }
  })

  document.getElementById('clear-cart').addEventListener('click', function () {
    cart = []
    renderCart()
  })

  document.getElementById('approve').addEventListener('click', function () {
    var total = cart.reduce(function (sum, p) { return sum + p.price }, 0)
    document.getElementById('hitl').classList.add('hidden')
    notify('Supervisor approved the order.')
    postOrderEvent('hitl_approved', total)
    shipOrder()
  })

  document.getElementById('deny').addEventListener('click', function () {
    var total = cart.reduce(function (sum, p) { return sum + p.price }, 0)
    document.getElementById('hitl').classList.add('hidden')
    notify('Supervisor denied the order.')
    postOrderEvent('hitl_denied', total)
  })

  renderCatalog()
  renderCart()
</script>`
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
 * into one Day-Planner micro-app — the "Plan C" merge of what were three
 * separate domain silos (TODO, WFD, itinerary) into a single generated app.
 * Reuses this project's established single-file HTML/Tailwind/vanilla-JS
 * shape (no framework inside the sandbox, matches every other scenario).
 *
 * All payload text is HTML-escaped before being embedded — this function is
 * a general synthesizer, not just a static template, so (unlike a hardcoded
 * const) it may eventually be fed AI/PO-derived content the same way
 * `swarmCodeSynthesizer.ts`'s order-entry synthesizer already treats
 * interview data as untrusted.
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
    <h1 class="text-2xl font-bold">✨ ${safeTitle}</h1>
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

  function renderErrands() {
    var list = document.getElementById('errand-list')
    list.innerHTML = ''
    TASKS.filter(function (t) { return t.category === 'errand' }).forEach(function (t) {
      var li = document.createElement('li')
      li.className = 'flex items-center gap-2'
      var meta = t.time ? ' <span class="text-slate-500">(' + t.time + (t.location ? ' · ' + t.location : '') + ')</span>' : ''
      li.innerHTML = '<input type="checkbox" id="' + t.id + '" class="h-4 w-4 rounded border-slate-700 bg-slate-800"' + (t.completed ? ' checked' : '') + ' />' +
        '<label for="' + t.id + '" class="' + (t.completed ? 'text-slate-500 line-through' : '') + '">' + t.title + meta + '</label>'
      list.appendChild(li)
    })
    Array.prototype.forEach.call(list.querySelectorAll('input'), function (input) {
      input.addEventListener('change', function (e) {
        var t = findChecklistItem(e.target.id)
        if (t) t.completed = e.target.checked
        renderErrands()
        persistState()
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
        '<label for="' + ing.id + '" class="' + (ing.completed ? 'text-slate-500 line-through' : '') + '">' + ing.text + '</label>'
      list.appendChild(li)
    })
    Array.prototype.forEach.call(list.querySelectorAll('input'), function (input) {
      input.addEventListener('change', function (e) {
        var item = findChecklistItem(e.target.id)
        if (item) item.completed = e.target.checked
        renderRecipe()
        persistState()
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
  })

  // Covers the standalone /share/:slug case (a real origin, no parent) —
  // harmlessly finds nothing yet when embedded in the sandbox iframe, since
  // that context's own localStorage never actually persisted across the
  // reload that just happened (see the comment on persistState() above).
  applyState(loadOwnLocalStorage())

  renderErrands()
  renderRecipe()
  renderEntertainment(entertainmentTask ? entertainmentTask.title : "Tonight's Game")
</script>`
}

const B2B_LEAD_SCORING_SNIPPET = `<div class="min-h-screen bg-slate-950 p-6 text-slate-100">
  <div class="mx-auto max-w-2xl">
    <h1 class="text-2xl font-bold">B2B Lead Scoring Bot</h1>
    <p class="mt-1 text-sm text-slate-400">Engine A: weighted threshold rules + a simulated outbound webhook alert.</p>

    <div class="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label class="text-sm text-slate-300">
          Company size
          <select id="company-size" class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-slate-100">
            <option value="small">Small (&lt;50 employees)</option>
            <option value="medium">Medium (50-500)</option>
            <option value="enterprise">Enterprise (500+)</option>
          </select>
        </label>
        <label class="text-sm text-slate-300">
          Monthly budget ($)
          <input id="budget" type="number" min="0" step="100" value="2000" class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-slate-100" />
        </label>
        <label class="text-sm text-slate-300">
          Urgency
          <select id="urgency" class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 p-2 text-sm text-slate-100">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>
      <button id="score" class="mt-4 w-full rounded-md bg-emerald-500 px-4 py-2 font-medium text-slate-950 hover:bg-emerald-400">
        Score Lead
      </button>
    </div>

    <div class="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Scored Leads</h2>
      <ul id="leads" class="mt-2 space-y-1 text-sm">
        <li class="text-slate-500">No leads scored yet.</li>
      </ul>
    </div>

    <div class="mt-6">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Webhook Alert Log</h2>
      <ul id="webhook-log" class="mt-2 space-y-2 text-sm text-slate-300"></ul>
    </div>
  </div>
</div>
<script>
  var SIZE_WEIGHT = { small: 10, medium: 25, enterprise: 40 }
  var URGENCY_WEIGHT = { low: 5, medium: 15, high: 30 }
  var leadCounter = 0
  var firstLead = true

  function classify(score) {
    if (score >= 80) return { label: 'Hot Lead', className: 'text-red-400' }
    if (score >= 40) return { label: 'Warm Lead', className: 'text-amber-300' }
    return { label: 'Cold Lead', className: 'text-sky-300' }
  }

  function logWebhook(message) {
    var list = document.getElementById('webhook-log')
    var li = document.createElement('li')
    li.className = 'rounded-md border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs'
    li.textContent = message
    list.insertBefore(li, list.firstChild)
  }

  document.getElementById('score').addEventListener('click', function () {
    var size = document.getElementById('company-size').value
    var budget = Number(document.getElementById('budget').value) || 0
    var urgency = document.getElementById('urgency').value

    var score = SIZE_WEIGHT[size] + Math.min(budget / 100, 30) + URGENCY_WEIGHT[urgency]
    score = Math.round(score)
    var result = classify(score)

    leadCounter += 1
    var list = document.getElementById('leads')
    if (firstLead) {
      list.innerHTML = ''
      firstLead = false
    }
    var li = document.createElement('li')
    li.className = 'flex justify-between rounded-md border border-slate-800 bg-slate-900 px-3 py-2'
    li.innerHTML = '<span>Lead #' + leadCounter + ' (' + size + ', $' + budget + '/mo, ' + urgency + ' urgency)</span>' +
      '<span class="font-semibold ' + result.className + '">' + result.label + ' — ' + score + '</span>'
    list.insertBefore(li, list.firstChild)

    if (result.label === 'Hot Lead') {
      logWebhook('POST https://hooks.crm.example/lead-alert -> 200 OK — lead #' + leadCounter + ' escalated to sales (score ' + score + ')')
    }
  })
</script>`

const DEFAULT_SANDBOX_SNIPPET = `<div class="flex min-h-screen items-center justify-center bg-slate-950 p-8">
  <div class="max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 text-center shadow-xl">
    <h1 class="text-xl font-semibold text-white">Default Sandbox</h1>
    <p class="mt-2 text-sm text-slate-400">
      Try a prompt containing "ACME order", "today itinerary", or "lead scoring" to generate
      one of the AgentZ Studio flagship dual-engine demo apps.
    </p>
  </div>
</div>`

/** A prompt may request its own auto-approve ceiling, e.g. "ACME Order 750". */
function extractRequestedThreshold(prompt: string): number | undefined {
  const match = prompt.match(/(\d{2,5})/)
  return match ? Number(match[1]) : undefined
}

export interface GeneratedApp {
  scenario: ScenarioId
  code: string
  /** Present only for acme-order — the resolved (possibly clamped) auto-approve threshold. */
  policyCheck?: PolicyCheckResult
}

export function generateAppSnippet(userPrompt: string, sessionId: string): GeneratedApp {
  const scenario = matchScenario(userPrompt)
  switch (scenario) {
    case 'acme-order': {
      const policyCheck = resolveOrderThreshold(extractRequestedThreshold(userPrompt))
      const code = buildAcmeOrderSnippet(policyCheck.value!, SYSTEM_CEILING.maxOrderThreshold, sessionId)
      return { scenario, code, policyCheck }
    }
    case 'today-itinerary':
      return { scenario, code: buildUnifiedItinerarySnippet(DEFAULT_UNIFIED_ITINERARY) }
    case 'b2b-lead-scoring':
      return { scenario, code: B2B_LEAD_SCORING_SNIPPET }
    default:
      return { scenario, code: DEFAULT_SANDBOX_SNIPPET }
  }
}
