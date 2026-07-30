import { For, Show, createSignal } from 'solid-js'

interface EcosystemModule {
  id: string
  label: string
  description: string
  /** Emoji fallback — only used when iconSrc isn't set (StreamZilla/GridZilla still have no dedicated logo asset). */
  icon: string
  /** Real logo image, when this module has one (studio/robert) — takes priority over `icon`. */
  iconSrc?: string
  href: string
  current?: boolean
}

const MODULES: EcosystemModule[] = [
  {
    id: 'studio',
    label: 'AgentZ Studio',
    description: 'AI swarm orchestration & micro-app generator.',
    icon: '🤖',
    iconSrc: '/agentz-logo.svg',
    href: '/',
    current: true,
  },
  {
    id: 'robert',
    label: 'Robert Nemzek',
    description: 'Principal software architecture & portfolio.',
    icon: '👤',
    iconSrc: '/rn-logo.svg',
    href: 'https://robert.nemzilla.net',
  },
  {
    id: 'streamzilla',
    label: 'StreamZilla',
    description: 'Live streaming & media hub.',
    icon: '🎬',
    iconSrc: '/streamzilla-logo.svg',
    href: 'https://streaming.nemzilla.net',
  },
  {
    id: 'gridzilla',
    label: 'GridZilla',
    description: 'Grid compute & infrastructure dashboard.',
    icon: '⚡',
    iconSrc: '/gridzilla-logo.svg',
    href: 'https://grid.nemzilla.net',
  },
]

export default function CommandCenterDrawer() {
  const [isOpen, setIsOpen] = createSignal(false)

  return (
    <>
      <button
        type="button"
        class="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-accent hover:text-text"
        onClick={() => setIsOpen(true)}
      >
        <span aria-hidden="true">☰</span> <span class="hidden sm:inline">Command Center</span>
      </button>

      <div
        class={`fixed inset-0 z-30 bg-black/60 transition-opacity ${
          isOpen() ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setIsOpen(false)}
      />

      <aside
        data-testid="command-center-drawer"
        class={`fixed inset-y-0 left-0 z-40 w-full max-w-sm overflow-y-auto border-r border-border bg-surface p-5 shadow-2xl transition-transform duration-300 ${
          isOpen() ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-text-muted">Command Center</h2>
          <button type="button" class="text-text-muted hover:text-text" onClick={() => setIsOpen(false)}>
            ✕
          </button>
        </div>

        <div class="space-y-3">
          <For each={MODULES}>
            {(mod) => (
              <a
                href={mod.href}
                target={mod.current ? undefined : '_blank'}
                rel={mod.current ? undefined : 'noopener noreferrer'}
                class="group flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3 transition-colors hover:border-accent"
                onClick={() => setIsOpen(false)}
              >
                <Show when={mod.iconSrc} fallback={
                  <span class="text-2xl" aria-hidden="true">
                    {mod.icon}
                  </span>
                }>
                  {(src) => <img src={src()} alt="" aria-hidden="true" class="h-8 w-8 shrink-0 rounded-md object-cover" />}
                </Show>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-text transition-colors group-hover:text-accent">{mod.label}</span>
                    <Show when={mod.current}>
                      <span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400">
                        Current
                      </span>
                    </Show>
                  </div>
                  <p class="mt-0.5 text-xs text-text-muted">{mod.description}</p>
                </div>
              </a>
            )}
          </For>
        </div>
      </aside>
    </>
  )
}
