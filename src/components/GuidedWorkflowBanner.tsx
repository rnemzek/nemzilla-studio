import { For, Show } from 'solid-js'
import { guideOpen, dismissGuide } from '../lib/guidedBannerStore.ts'

const STEPS = [
  { icon: '💬', text: 'Tell AgentZ what to build, in plain English, in the box below.' },
  { icon: '🐝', text: 'Watch the Swarm Canvas above animate every agent as it plans, builds, and reviews.' },
  { icon: '📱', text: 'See your generated app come alive in App Preview, ready to click through.' },
  { icon: '🚀', text: "Click 'Publish Live App' to generate a QR code and run your app live on your mobile device." },
]

/** The onboarding CTA — scrolls to and focuses AgentZ's own prompt box. Plain DOM query rather than a store: a one-shot action with nothing ongoing to keep in sync. `preventScroll` stops the browser's own focus-jump from fighting the smooth scroll that follows it. */
function focusPrompt(): void {
  const input = document.querySelector<HTMLTextAreaElement>('[data-testid="terminal"] textarea')
  if (!input) return
  input.focus({ preventScroll: true })
  input.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/**
 * UAT fix: converted from a full-width collapsible drawer living below the
 * header into a real `fixed inset-0` modal, matching ExecutiveShowcaseModal.tsx's
 * established pattern. The previous inline placement reproduced the exact
 * bug this fix targets — clicking "How it Works" while scrolled down opened
 * a banner at the *top* of the page, off-screen and invisible until the
 * visitor manually scrolled back up. A viewport-fixed overlay can't have
 * that problem: it's positioned relative to the viewport, not document flow,
 * so it opens centered in view regardless of scroll depth — which also
 * fully subsumes the earlier "pushes the Swarm Canvas off both edges of the
 * viewport" collision this component's inline version was original built to
 * avoid (a fixed-position element can never push sibling layout around,
 * unlike a document-flow one).
 *
 * `guidedBannerStore.ts`'s default was flipped from open-on-first-visit to
 * closed — ExecutiveShowcaseModal.tsx already defaults open on first visit,
 * and two full-screen blocking overlays racing to open on the same fresh
 * page load would silently stack (only the later one in DOM order is even
 * visible), not a real "both work" outcome. This guide is still one click
 * away via the header's "How it Works" button at any time.
 */
export default function GuidedWorkflowBanner() {
  function launch() {
    dismissGuide()
    focusPrompt()
  }

  return (
    <Show when={guideOpen()}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={dismissGuide}
      >
        <div
          class="w-full max-w-md rounded-lg border border-accent/20 bg-surface p-5 text-left shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-text">👋 New here? Here's how it works</p>
              <p class="mt-1 text-xs text-text-muted">
                Watch AI agents build, verify, and run full-stack web apps in real time — no code required.
              </p>
            </div>
            <button
              type="button"
              class="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-text-muted transition-colors hover:border-red-400/50 hover:text-red-300"
              onClick={dismissGuide}
            >
              ✕ Dismiss
            </button>
          </div>

          <ol class="mt-3 space-y-1.5">
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

          <button
            type="button"
            class="mt-3 w-full animate-pulse rounded-md bg-accent px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-accent/90"
            onClick={launch}
          >
            🚀 Click here to blast off!
          </button>
        </div>
      </div>
    </Show>
  )
}
