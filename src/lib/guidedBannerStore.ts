import { createSignal } from 'solid-js'

/**
 * UAT fix: the guided "how it works" drawer's open/closed state — shared
 * between `EcosystemNav.tsx` (the ℹ️ header toggle button) and
 * `GuidedWorkflowBanner.tsx` (the drawer itself, now rendered outside the
 * header entirely), same pattern as `adminDrawerStore.ts`'s toggle-button-
 * in-nav/drawer-elsewhere shape. `localStorage` key/value spelled exactly as
 * specified (`agentz_guide_dismissed` / `'true'`), not this project's usual
 * `nemzilla-studio:` prefix convention — an explicit, deliberate rename.
 */
const STORAGE_KEY = 'agentz_guide_dismissed'

function loadDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function persistDismissed(dismissed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, dismissed ? 'true' : 'false')
  } catch {
    // best-effort — a failed write just means the drawer re-shows next visit
  }
}

const [guideOpen, setGuideOpenSignal] = createSignal(!loadDismissed())

export { guideOpen }

export function toggleGuide(): void {
  setGuideOpenSignal((current) => {
    const next = !current
    persistDismissed(!next)
    return next
  })
}

/** The prominent "✕ Dismiss" button inside the drawer — sets the dismissed flag explicitly, distinct from toggleGuide()'s open<->closed flip (dismissing should never re-open on its own). */
export function dismissGuide(): void {
  setGuideOpenSignal(false)
  persistDismissed(true)
}
