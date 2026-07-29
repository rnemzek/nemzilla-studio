import { createSignal } from 'solid-js'

/**
 * The guided "how it works" modal's open/closed state — shared between
 * `EcosystemNav.tsx` (the ℹ️ header toggle button) and
 * `GuidedWorkflowBanner.tsx` (the modal itself).
 *
 * UAT fix: this used to default open on first visit, persisting dismissal to
 * `localStorage` so it wouldn't nag a returning visitor. Now that
 * `GuidedWorkflowBanner.tsx` is a `fixed inset-0` blocking modal (previously
 * an inline drawer), that default-open would race ExecutiveShowcaseModal.tsx
 * — which already opens on first visit — and two full-screen overlays both
 * defaulting open silently stack (only the later one in DOM order is even
 * visible). This modal now only ever opens from an explicit "How it Works"
 * click, so there's nothing to persist across visits — the localStorage
 * read/write this file used to do is gone, not just unused.
 */
const [guideOpen, setGuideOpenSignal] = createSignal(false)

export { guideOpen }

export function toggleGuide(): void {
  setGuideOpenSignal((current) => !current)
}

/** The modal's "✕ Dismiss" button and backdrop click. */
export function dismissGuide(): void {
  setGuideOpenSignal(false)
}
