import { createSignal } from 'solid-js'

/**
 * Executive Showcase modal's open/closed state — shared between
 * `EcosystemNav.tsx` (the ⚡ "Executive Summary" header button) and
 * `ExecutiveShowcaseModal.tsx` itself, same toggle-in-nav/content-elsewhere
 * shape as `guidedBannerStore.ts`/`adminDrawerStore.ts`.
 *
 * UAT fix: this used to gate the initial-mount default behind a
 * `localStorage` "seen" flag, so a visitor who'd already dismissed it once
 * never saw it again on a later visit. That's deliberately gone now — the
 * pitch always opens on a fresh page load or new tab, no persisted state
 * involved. Dismissing (either button) or reopening (the header button) only
 * ever changes this in-memory signal for the current page session.
 */
const [showcaseOpen, setShowcaseOpen] = createSignal(true)

export { showcaseOpen }

/** Header's "⚡ Executive Summary" button — reopens the pitch on demand. */
export function openExecutiveShowcase(): void {
  setShowcaseOpen(true)
}

/** "🚀 Launch Live Workspace" and the modal's own "✕"/backdrop click. */
export function dismissExecutiveShowcase(): void {
  setShowcaseOpen(false)
}
