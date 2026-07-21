import { For } from 'solid-js'

interface EcosystemLink {
  label: string
  href: string
}

const ECOSYSTEM_LINKS: EcosystemLink[] = [
  { label: 'Robert', href: 'https://robert.nemzilla.net' },
  { label: 'Streaming', href: 'https://streaming.nemzilla.net' },
  { label: 'Grid', href: 'https://grid.nemzilla.net' },
]

function EcosystemNav() {
  return (
    <header class="flex w-full items-center justify-between border-b border-border bg-surface px-6 py-3">
      <span class="font-mono text-sm tracking-wide text-text">
        NemZilla<span class="text-accent">.</span>net
      </span>
      <nav aria-label="Ecosystem quick-launch" class="flex items-center gap-2">
        <For each={ECOSYSTEM_LINKS}>
          {(link) => (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              class="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-accent hover:text-text"
            >
              {link.label}
            </a>
          )}
        </For>
      </nav>
    </header>
  )
}

export default EcosystemNav
