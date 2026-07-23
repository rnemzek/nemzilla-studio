import { For, Show, createSignal } from 'solid-js'

const STORAGE_KEY = 'nemzilla-studio:guided-banner-collapsed'

const STEPS = [
  { icon: '💬', text: 'Tell the AI PO what to build, in plain English, in the terminal below.' },
  { icon: '🐝', text: 'Watch the Swarm Canvas above animate every agent as it plans, builds, and reviews.' },
  { icon: '📱', text: 'See your generated app come alive in App Preview, ready to click through.' },
]

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persistCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // best-effort — a failed write just means the banner re-shows next visit
  }
}

/** Pass D Task 2: a "what is this and where do I start" banner — collapsible, persisted per-browser so a returning visitor who already dismissed it isn't shown it again. */
export default function GuidedWorkflowBanner() {
  const [collapsed, setCollapsed] = createSignal(loadCollapsed())

  function toggle() {
    setCollapsed((current) => {
      const next = !current
      persistCollapsed(next)
      return next
    })
  }

  return (
    <section class="w-full max-w-2xl rounded-lg border border-accent/30 bg-accent/5 text-left">
      <button type="button" class="flex w-full items-center justify-between gap-2 px-4 py-2.5" onClick={toggle}>
        <span class="text-sm font-medium text-text">👋 New here? Here's how it works</span>
        <span class="shrink-0 text-xs text-text-muted">{collapsed() ? '▸ Show' : '▾ Hide'}</span>
      </button>

      <Show when={!collapsed()}>
        <div class="border-t border-accent/20 px-4 py-3">
          <p class="text-xs text-text-muted">
            Watch AI agents build, verify, and run full-stack web apps in real time — no code required.
          </p>
          <ol class="mt-2 space-y-1.5">
            <For each={STEPS}>
              {(step, i) => (
                <li class="flex items-start gap-2 text-xs text-text">
                  <span class="shrink-0 font-mono text-text-muted">{i() + 1}.</span>
                  <span aria-hidden="true">{step.icon}</span>
                  <span>{step.text}</span>
                </li>
              )}
            </For>
          </ol>
        </div>
      </Show>
    </section>
  )
}
