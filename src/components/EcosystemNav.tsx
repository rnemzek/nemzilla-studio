import { Show } from 'solid-js'
import CommandCenterDrawer from './CommandCenterDrawer.tsx'
import BibleModal from './BibleModal.tsx'
import CookbookDropdown from './CookbookDropdown.tsx'
import RnAvatar from './RnAvatar.tsx'
import { currentRoleBadge } from '../lib/sessionRoleStore.ts'

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
    <header class="flex w-full flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3 sm:px-6">
      <div class="flex items-center gap-2">
        <RnAvatar size={22} class="shrink-0" />
        <span class="font-mono text-sm tracking-wide text-text">
          NemZilla<span class="text-accent">.</span>net
        </span>
        <CommandCenterDrawer />
      </div>
      <nav aria-label="Studio controls" class="flex flex-wrap items-center gap-2">
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
