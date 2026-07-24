import { createSignal } from 'solid-js'

/**
 * Executive Showcase modal's open/closed state — shared between
 * `EcosystemNav.tsx` (the ⚡ "Executive Summary" header button) and
 * `ExecutiveShowcaseModal.tsx` itself, same toggle-in-nav/content-elsewhere
 * shape as `guidedBannerStore.ts`/`adminDrawerStore.ts`. Defaults to open on
 * a visitor's very first load (no `localStorage` flag set yet) so
 * first-time hiring managers/recruiters see the product pitch before
 * anything else; reading the header button afterward never touches the
 * persisted flag, so manually reopening the pitch doesn't change whether it
 * auto-shows again on a future fresh visit.
 */
const STORAGE_KEY = 'agentz_executive_seen'

function loadSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function persistSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // best-effort — a failed write just means the pitch re-shows next visit
  }
}

const [showcaseOpen, setShowcaseOpen] = createSignal(!loadSeen())

export { showcaseOpen }

/** Header's "⚡ Executive Summary" button — reopens the pitch on demand without marking it seen. */
export function openExecutiveShowcase(): void {
  setShowcaseOpen(true)
}

/** "🚀 Launch Live Workspace" and the modal's own "✕" — either way the visitor has seen the pitch, so both dismiss and persist the seen flag. */
export function dismissExecutiveShowcase(): void {
  setShowcaseOpen(false)
  persistSeen()
}
