/**
 * UOW-11 Task 11.6: consumes the aggregated session bundle (vendor/catalog
 * from the PO interview, the resolved policy ceilings, and the dispatched
 * domain agents' labels) to synthesize a real, executable order-entry
 * micro-app — the conversational-build counterpart to
 * appGeneratorPrompt.ts's buildAcmeOrderSnippet, parameterized by actual
 * interview data instead of a fixed scenario template. Reuses the exact same
 * Dual-Engine app shape (catalog, cart, HITL modal, virtual notification
 * drawer) established in UOW-07/UOW-08, so the generated app looks and
 * behaves consistently with every other AgentZ Studio scenario.
 */
import type { DomainAgentResult } from './domainAgents.ts'

// Mirrors SANDBOX_MESSAGE.order in src/lib/sandboxTemplate.ts. Duplicated
// rather than imported: src/server and src/lib sit in separate tsconfig
// projects (see sandboxFrame.ts for the same established pattern), so a
// cross-project import isn't viable here.
const ORDER_MESSAGE_TYPE = 'nemzilla:sandbox-order-decision'

export interface SwarmCatalogItem {
  name: string
  price: number
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Safe to embed inside a <script> block: JSON.stringify already escapes quotes/backslashes; neutralizing `<` additionally guards against a value like `</script>` prematurely closing the tag. */
function toInlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function synthesizeOrderEntryApp(
  sessionId: string,
  vendorName: string,
  items: SwarmCatalogItem[],
  autoApproveCeiling: number,
  denyCeiling: number,
  dispatched: DomainAgentResult[],
): string {
  const safeVendor = escapeHtml(vendorName)
  const dispatchedLabel = escapeHtml(dispatched.map((d) => d.agent).join(', '))
  const productsJson = toInlineJson(items.map((item, i) => ({ id: `item-${i}`, name: item.name, price: item.price })))

  return `<div class="min-h-screen bg-slate-950 p-6 text-slate-100">
  <div class="mx-auto max-w-2xl">
    <h1 class="text-2xl font-bold">${safeVendor} — Order Entry &amp; Approval</h1>
    <p class="mt-1 text-sm text-slate-400">Built by ${dispatchedLabel} — synthetic catalog, in-cart state, and a policy interceptor.</p>
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
  var SESSION_ID = ${toInlineJson(sessionId)}
  var PRODUCTS = ${productsJson}
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
    notify('Email: Order shipped — tracking #ORD-' + orderCounter)
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
