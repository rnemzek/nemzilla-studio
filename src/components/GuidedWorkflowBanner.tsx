import { For } from 'solid-js'
import { guideOpen, dismissGuide } from '../lib/guidedBannerStore.ts'

const STEPS = [
  { icon: '💬', text: 'Tell AgentZ what to build, in plain English, in the box below.' },
  { icon: '🐝', text: 'Watch the Swarm Canvas above animate every agent as it plans, builds, and reviews.' },
  { icon: '📱', text: 'See your generated app come alive in App Preview, ready to click through.' },
]

/** The onboarding CTA — scrolls to and focuses AgentZ's own prompt box. Plain DOM query rather than a store: a one-shot action with nothing ongoing to keep in sync. `preventScroll` stops the browser's own focus-jump from fighting the smooth scroll that follows it. */
function focusPrompt(): void {
  const input = document.querySelector<HTMLTextAreaElement>('[data-testid="terminal"] textarea')
  if (!input) return
  input.focus({ preventScroll: true })
  input.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/**
 * UAT fix: converted from a card living *inside* the workspace's vertically-
 * centered flex column into a full-width collapsible drawer directly below
 * the header. The old placement was the actual root cause of the reported
 * viewport-collision bug — when expanded, its own height pushed the Swarm
 * Canvas/workspace grid off both edges of the viewport (a `justify-center`
 * flex column centers its *total* content height, so extra height at the
 * top pushes the rest down and off the bottom in equal measure). Living
 * outside that centered flow entirely, as its own full-width section,
 * removes it from that computation regardless of open/closed state — see
 * App.tsx's own layout fix for the other half of this.
 *
 * `max-height` transitions (not `height`, which can't animate to/from
 * `auto` in CSS) — same technique `Terminal.tsx`'s expand/collapse already
 * uses, kept consistent rather than introducing a second technique for the
 * same kind of animation.
 */
export default function GuidedWorkflowBanner() {
  return (
    <section class="w-full border-b border-accent/20 bg-accent/5 text-left">
      <div
        class={`mx-auto max-w-3xl overflow-hidden px-6 transition-[max-height,opacity] duration-300 ${
          guideOpen() ? 'max-h-[480px] py-4 opacity-100' : 'max-h-0 py-0 opacity-0'
        }`}
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
          onClick={focusPrompt}
        >
          🚀 Click here to blast off!
        </button>
      </div>
    </section>
  )
}
