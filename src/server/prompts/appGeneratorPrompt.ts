import { ACTION_KIT_REGISTRY } from '../../lib/actionKit.ts'
import { resolveOrderThreshold, SYSTEM_CEILING, type PolicyCheckResult } from '../services/policyEngine.ts'

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

function buildAcmeOrderSnippet(autoApproveCeiling: number, denyCeiling: number): string {
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
      <button id="submit" class="mt-4 w-full rounded-md bg-emerald-500 px-4 py-2 font-medium text-slate-950 hover:bg-emerald-400">
        Submit Order
      </button>
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
  var AUTO_APPROVE_CEILING = ${autoApproveCeiling}
  var DENY_CEILING = ${denyCeiling}
  var cart = []
  var orderCounter = 99

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
      ? cart.map(function (p) { return '<li class="flex justify-between"><span>' + p.name + '</span><span>$' + p.price.toFixed(2) + '</span></li>' }).join('')
      : '<li class="text-slate-500">No items yet — add something from the catalog.</li>'
    var total = cart.reduce(function (sum, p) { return sum + p.price }, 0)
    document.getElementById('total').textContent = '$' + total.toFixed(2)
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
      shipOrder()
    } else if (total <= DENY_CEILING) {
      document.getElementById('hitl').classList.remove('hidden')
    } else {
      notify('Policy: total $' + total.toFixed(2) + ' > $' + DENY_CEILING + ' — auto-denied.')
    }
  })

  document.getElementById('approve').addEventListener('click', function () {
    document.getElementById('hitl').classList.add('hidden')
    notify('Supervisor approved the order.')
    shipOrder()
  })

  document.getElementById('deny').addEventListener('click', function () {
    document.getElementById('hitl').classList.add('hidden')
    notify('Supervisor denied the order.')
  })

  renderCatalog()
  renderCart()
</script>`
}

const TODAY_ITINERARY_SNIPPET = `<div class="min-h-screen bg-slate-950 p-6 text-slate-100">
  <div class="mx-auto max-w-3xl">
    <h1 class="text-2xl font-bold">My TODAY Itinerary</h1>
    <p class="mt-1 text-sm text-slate-400">Engine B: live fetches from MLB Stats, TheMealDB, and Open-Meteo — plus a weekend errand checklist.</p>

    <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div id="game-card" class="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Tonight's Game</h2>
        <p class="mt-2 text-sm text-slate-300">Loading…</p>
      </div>
      <div id="meal-card" class="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Dinner Recipe</h2>
        <p class="mt-2 text-sm text-slate-300">Loading…</p>
      </div>
      <div id="weather-card" class="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Weather Now</h2>
        <p class="mt-2 text-sm text-slate-300">Loading…</p>
      </div>
    </div>

    <div class="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Weekend Errands</h2>
      <ul id="errands" class="mt-2 space-y-2 text-sm"></ul>
    </div>

    <div class="mt-6">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Virtual Bus Alerts</h2>
      <ul id="alerts" class="mt-2 space-y-2 text-sm text-slate-300"></ul>
    </div>
  </div>
</div>
<script>
  var FALLBACK = {
    game: { away: 'New York Yankees', home: 'Baltimore Orioles' },
    meal: { name: 'Chicken Handi', instructions: 'Marinate the chicken, sear it, then simmer in a spiced tomato-yogurt sauce until tender.' },
    weather: { tempC: 25.8, windKph: 9.6 },
  }

  function pushAlert(message) {
    var list = document.getElementById('alerts')
    var li = document.createElement('li')
    li.className = 'rounded-md border border-slate-800 bg-slate-900 px-3 py-2'
    li.textContent = message
    list.insertBefore(li, list.firstChild)
  }

  fetch('https://statsapi.mlb.com/api/v1/schedule?sportId=1')
    .then(function (r) { return r.json() })
    .then(function (data) {
      var game = data.dates && data.dates[0] && data.dates[0].games && data.dates[0].games[0]
      var away = game ? game.teams.away.team.name : FALLBACK.game.away
      var home = game ? game.teams.home.team.name : FALLBACK.game.home
      document.querySelector('#game-card p').innerHTML = '<span class="font-medium">' + away + '</span> @ <span class="font-medium">' + home + '</span>'
      pushAlert('7:30 PM: ' + away + ' vs ' + home + ' starting on YouTubeTV')
    })
    .catch(function () {
      document.querySelector('#game-card p').textContent = FALLBACK.game.away + ' @ ' + FALLBACK.game.home + ' (offline fallback)'
    })

  fetch('https://www.themealdb.com/api/json/v1/1/search.php?s=chicken')
    .then(function (r) { return r.json() })
    .then(function (data) {
      var meal = data.meals && data.meals[0]
      var name = meal ? meal.strMeal : FALLBACK.meal.name
      var instructions = meal ? meal.strInstructions : FALLBACK.meal.instructions
      document.querySelector('#meal-card p').innerHTML = '<span class="font-medium">' + name + '</span><br><span class="text-slate-400">' + instructions.slice(0, 90) + '…</span>'
      pushAlert('5:00 PM: Get groceries for ' + name)
    })
    .catch(function () {
      document.querySelector('#meal-card p').textContent = FALLBACK.meal.name + ' (offline fallback)'
    })

  fetch('https://api.open-meteo.com/v1/forecast?latitude=39.29&longitude=-76.61&current_weather=true')
    .then(function (r) { return r.json() })
    .then(function (data) {
      var c = data.current_weather ? data.current_weather.temperature : FALLBACK.weather.tempC
      var wind = data.current_weather ? data.current_weather.windspeed : FALLBACK.weather.windKph
      var f = Math.round((c * 9) / 5 + 32)
      document.querySelector('#weather-card p').innerHTML = '<span class="font-medium">' + f + '°F</span><br><span class="text-slate-400">wind ' + Math.round(wind) + ' km/h</span>'
    })
    .catch(function () {
      var f = Math.round((FALLBACK.weather.tempC * 9) / 5 + 32)
      document.querySelector('#weather-card p').textContent = f + '°F (offline fallback)'
    })

  var ERRANDS = ["Get mulch from Lowe's", 'Jiffy Lube inspection', 'Groceries for chicken salad']
  var list = document.getElementById('errands')
  ERRANDS.forEach(function (task, i) {
    var li = document.createElement('li')
    li.className = 'flex items-center gap-2'
    li.innerHTML = '<input type="checkbox" id="errand-' + i + '" class="h-4 w-4 rounded border-slate-700 bg-slate-800" /><label for="errand-' + i + '">' + task + '</label>'
    list.appendChild(li)
    li.querySelector('input').addEventListener('change', function (e) {
      if (e.target.checked) pushAlert('Done: ' + task)
    })
  })
</script>`

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

export function generateAppSnippet(userPrompt: string): GeneratedApp {
  const scenario = matchScenario(userPrompt)
  switch (scenario) {
    case 'acme-order': {
      const policyCheck = resolveOrderThreshold(extractRequestedThreshold(userPrompt))
      const code = buildAcmeOrderSnippet(policyCheck.value!, SYSTEM_CEILING.maxOrderThreshold)
      return { scenario, code, policyCheck }
    }
    case 'today-itinerary':
      return { scenario, code: TODAY_ITINERARY_SNIPPET }
    case 'b2b-lead-scoring':
      return { scenario, code: B2B_LEAD_SCORING_SNIPPET }
    default:
      return { scenario, code: DEFAULT_SANDBOX_SNIPPET }
  }
}
