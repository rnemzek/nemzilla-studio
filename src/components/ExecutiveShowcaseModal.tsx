import { For, Show } from 'solid-js'
import { showcaseOpen, dismissExecutiveShowcase } from '../lib/executiveShowcaseStore.ts'

/** Robert's own portfolio/resume site — the same destination `/launch robert` already opens (see terminalCommands.ts's LAUNCH_TARGETS), reused here rather than a new URL. */
const RESUME_URL = 'https://robert.nemzilla.net'

const VALUE_PROPS: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: '⚡',
    title: 'Instant Micro-Apps',
    body: 'Synthesizes natural language into interactive B2B Order Entry or Unified Itinerary applications in under 60 seconds.',
  },
  {
    icon: '🌐',
    title: 'Edge Publishing Engine',
    body: 'Generates instant mobile-ready links (/share/:slug) and scannable QR codes with persistent state.',
  },
  {
    icon: '🐝',
    title: 'Multi-Agent Orchestration',
    body: 'Powered by a parallel AI Swarm — Planner, Architect, Lead Dev, Reviewer, and the AI PO.',
  },
]

/**
 * The product pitch a non-technical hiring manager or PO sees first: what
 * this platform actually does, in plain terms, before they land in the
 * (necessarily more technical-looking) live workspace. Shows automatically
 * on a visitor's first load (see executiveShowcaseStore.ts's default-open
 * logic) and can be reopened any time from EcosystemNav.tsx's header button.
 */
export default function ExecutiveShowcaseModal() {
  return (
    <Show when={showcaseOpen()}>
      <div
        class="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
        onClick={() => dismissExecutiveShowcase()}
      >
        <div
          data-testid="executive-showcase-modal"
          class="w-full max-w-lg rounded-xl border border-border bg-surface p-6 text-left shadow-2xl sm:p-8"
          onClick={(event) => event.stopPropagation()}
        >
          <div class="flex items-start justify-between gap-3">
            <p class="font-mono text-xs uppercase tracking-widest text-accent">Executive Overview</p>
            <button
              type="button"
              class="text-text-muted hover:text-text"
              onClick={() => dismissExecutiveShowcase()}
            >
              ✕
            </button>
          </div>
          <h1 class="mt-3 text-2xl leading-snug font-bold text-text sm:text-3xl">
            NemZilla Studio: Conversational AI-Native Micro-App Platform
          </h1>
          <ul class="mt-5 space-y-4">
            <For each={VALUE_PROPS}>
              {(prop) => (
                <li class="flex gap-3">
                  <span class="text-xl" aria-hidden="true">
                    {prop.icon}
                  </span>
                  <div>
                    <p class="font-semibold text-text">{prop.title}</p>
                    <p class="text-sm text-text-muted">{prop.body}</p>
                  </div>
                </li>
              )}
            </For>
          </ul>
          <div class="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              class="flex-1 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-accent/90"
              onClick={() => dismissExecutiveShowcase()}
            >
              🚀 Launch Live Workspace
            </button>
            <a
              href={RESUME_URL}
              target="_blank"
              rel="noopener noreferrer"
              class="flex-1 rounded-md border border-border px-4 py-2.5 text-center text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent"
            >
              📄 View Resume / Architecture Spec
            </a>
          </div>
        </div>
      </div>
    </Show>
  )
}
