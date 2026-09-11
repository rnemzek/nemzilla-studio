/**
 * UOW-11 Task 11.6 / UOW-6.0: consumes the aggregated session bundle
 * (vendor/catalog from the PO interview, the resolved policy ceilings, and
 * the dispatched domain agents' labels) to synthesize a real, executable
 * TODO list micro-app — the conversational-build counterpart to
 * appGeneratorPrompt.ts's buildUnifiedItinerarySnippet, parameterized by
 * actual interview data instead of a fixed scenario template.
 */
import type { DomainAgentResult } from './domainAgents.ts'

export interface SwarmCatalogItem {
  name: string
  price: number
  /** A stated time for this item (e.g. "8:00 AM"). */
  time?: string | null
  /** Nested sub-items belonging to this parent (e.g. grocery items under "Get Groceries"). */
  subItems?: string[] | null
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Safe to embed inside a <script> block: JSON.stringify already escapes quotes/backslashes; neutralizing `<` additionally guards against a value like `</script>` prematurely closing the tag. */
function toInlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/**
 * The swarm build's Lead Dev synthesizer (UOW-6.0: the platform's single
 * supported app-generation domain). Takes the discovery interview's
 * domain-neutral `{name, price}` catalog-item shape (see poInterviewLLM.ts)
 * and renders it as a task checklist. Reuses the checkbox
 * strikethrough/progress-badge visual language already established for the
 * Unified Itinerary Synthesizer (appGeneratorPrompt.ts's
 * buildUnifiedItinerarySnippet) rather than inventing a new completion
 * pattern.
 */
export function synthesizeItineraryApp(
  planName: string,
  tasks: SwarmCatalogItem[],
  approvalThreshold: number,
  systemCeiling: number,
  dispatched: DomainAgentResult[],
): string {
  const safePlan = escapeHtml(planName)
  const dispatchedLabel = escapeHtml(dispatched.map((d) => d.agent).join(', '))
  // Pre-escaped here (not left to the client-side render, which just
  // concatenates these values straight into innerHTML) — matches
  // appGeneratorPrompt.ts's buildUnifiedItinerarySnippet() convention, since
  // these strings originate from the PO interview's untrusted catalog input.
  const tasksJson = toInlineJson(
    tasks.map((task, i) => ({
      id: `task-${i}`,
      name: escapeHtml(task.name),
      price: task.price,
      time: task.time ?? null,
      completed: false,
      subItems: (task.subItems ?? []).map((text, j) => ({ id: `task-${i}-sub-${j}`, text: escapeHtml(text), completed: false })),
    })),
  )
  const initialTotal = tasks.reduce((sum, task) => sum + 1 + (task.subItems?.length ?? 0), 0)

  return `<div class="min-h-screen bg-slate-950 p-6 text-slate-100">
  <div class="mx-auto max-w-2xl">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-bold">✨ ${safePlan}</h1>
      <span id="progress-badge" class="whitespace-nowrap rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 transition-all">0/${initialTotal} Completed</span>
    </div>
    <p class="mt-1 text-sm text-slate-400">Built by ${dispatchedLabel} — a task checklist with a spending threshold check.</p>
    <p class="mt-1 text-xs text-slate-500">Governance: any single task over $${approvalThreshold} is flagged for review &middot; $${systemCeiling} system ceiling.</p>

    <div class="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-400">Tasks</h2>
      <ul id="task-list" class="mt-2 space-y-2 text-sm"></ul>
    </div>
  </div>
</div>
<script>
  var TASKS = ${tasksJson}
  var APPROVAL_THRESHOLD = ${approvalThreshold}

  function findItem(id) {
    for (var i = 0; i < TASKS.length; i++) {
      var t = TASKS[i]
      if (t.id === id) return t
      for (var j = 0; j < t.subItems.length; j++) {
        if (t.subItems[j].id === id) return t.subItems[j]
      }
    }
    return null
  }

  function updateProgressBadge() {
    var total = 0
    var completed = 0
    TASKS.forEach(function (t) {
      total += 1
      if (t.completed) completed += 1
      t.subItems.forEach(function (si) {
        total += 1
        if (si.completed) completed += 1
      })
    })
    document.getElementById('progress-badge').textContent = completed + '/' + total + ' Completed'
  }

  function renderTasks() {
    var list = document.getElementById('task-list')
    list.innerHTML = TASKS.map(function (t) {
      var flagged = t.price > APPROVAL_THRESHOLD
        ? ' <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">⚠ needs approval</span>'
        : ''
      var cost = t.price > 0 ? ' <span class="text-slate-500">($' + t.price.toFixed(2) + ')</span>' : ''
      var meta = t.time ? ' <span class="text-slate-500">(' + t.time + ')</span>' : ''
      var labelClass = t.completed ? 'transition-all line-through opacity-50' : 'transition-all'
      var subList = t.subItems.length
        ? '<ul class="mt-1.5 ml-6 space-y-1">' + t.subItems.map(function (si) {
            var subLabelClass = si.completed ? 'transition-all line-through opacity-50' : 'transition-all'
            return '<li class="flex items-center gap-2">' +
              '<input type="checkbox" id="' + si.id + '" class="h-3.5 w-3.5 rounded border-slate-700 bg-slate-800"' + (si.completed ? ' checked' : '') + ' />' +
              '<label for="' + si.id + '" class="' + subLabelClass + ' text-slate-300">' + si.text + '</label>' +
              '</li>'
          }).join('') + '</ul>'
        : ''
      return '<li>' +
        '<div class="flex items-center gap-2">' +
        '<input type="checkbox" id="' + t.id + '" class="h-4 w-4 rounded border-slate-700 bg-slate-800"' + (t.completed ? ' checked' : '') + ' />' +
        '<label for="' + t.id + '" class="' + labelClass + '">' + t.name + meta + cost + flagged + '</label>' +
        '</div>' + subList +
        '</li>'
    }).join('')
    Array.prototype.forEach.call(list.querySelectorAll('input'), function (input) {
      input.addEventListener('change', function (e) {
        var item = findItem(e.target.id)
        if (item) item.completed = e.target.checked
        renderTasks()
        updateProgressBadge()
      })
    })
  }

  renderTasks()
  updateProgressBadge()
</script>`
}
