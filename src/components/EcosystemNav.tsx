import { Show } from 'solid-js'
import CommandCenterDrawer from './CommandCenterDrawer.tsx'
import BibleModal from './BibleModal.tsx'
import CookbookDropdown from './CookbookDropdown.tsx'
import VisitorTag from './VisitorTag.tsx'
import FeedbackModal from './FeedbackModal.tsx'
import PingDevModal from './PingDevModal.tsx'
import { currentRoleBadge } from '../lib/sessionRoleStore.ts'
import { toggleGuide } from '../lib/guidedBannerStore.ts'
import { openExecutiveShowcase } from '../lib/executiveShowcaseStore.ts'

const ROLE_BADGE_LABEL: Record<'builder' | 'spectator', string> = {
  builder: '🟢 ACTIVE BUILDER',
  spectator: '👀 SPECTATOR MODE',
}

const ROLE_BADGE_CLASS: Record<'builder' | 'spectator', string> = {
  builder: 'border-emerald-500/40 text-emerald-400',
  spectator: 'border-border text-text-muted',
}

function EcosystemNav() {
  return (
    <header class="sticky top-0 z-20 flex w-full flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3 sm:px-6">
      <div class="flex items-center gap-2">
        <img src="/agentz-logo.png" alt="AgentZ Studio" class="h-6 w-6 shrink-0 rounded-md object-cover" />
        <span class="font-mono text-sm tracking-wide text-text">AgentZ Studio</span>
        <CommandCenterDrawer />
        <a
          href="https://robert.nemzilla.net"
          target="_blank"
          rel="noopener noreferrer"
          title="Built by Robert Nemzek"
          class="ml-1 shrink-0 opacity-60 transition-opacity hover:opacity-100"
        >
          <img src="/rn-logo.png" alt="Robert Nemzek" class="h-5 w-5 rounded-full object-cover" />
        </a>
      </div>
      <nav aria-label="Studio controls" class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-text sm:px-3"
          onClick={openExecutiveShowcase}
        >
          <span aria-hidden="true">⚡</span> <span class="hidden sm:inline">Executive Summary</span>
        </button>
        <button
          type="button"
          class="whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-text sm:px-3"
          onClick={toggleGuide}
        >
          <span aria-hidden="true">ℹ️</span> <span class="hidden sm:inline">How it Works</span>
        </button>
        <VisitorTag />
        <PingDevModal />
        <FeedbackModal />
        <BibleModal />
        <CookbookDropdown />
        <Show when={currentRoleBadge()}>
          {(role) => (
            <span class={`rounded-md border px-2 py-1.5 font-mono text-[11px] sm:px-3 sm:text-xs ${ROLE_BADGE_CLASS[role()]}`}>
              {ROLE_BADGE_LABEL[role()]}
            </span>
          )}
        </Show>
      </nav>
    </header>
  )
}

export default EcosystemNav
