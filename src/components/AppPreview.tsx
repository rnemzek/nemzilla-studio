import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { sandboxStore, type PreviewTab } from '../lib/sandboxStore.ts'
import { SANDBOX_FRAME_PATH } from '../lib/sandboxTemplate.ts'
import { policyTrajectoryState, TRAJECTORY_STAGES, decisionLabel } from '../lib/policyTrajectoryStore.ts'
import { activeTemplateId, getActiveTemplate } from '../lib/templateStore.ts'
import SaveRecipeModal from './SaveRecipeModal.tsx'
import PublishModal from './PublishModal.tsx'
import ArtifactsPanel from './ArtifactsPanel.tsx'
import PanelHelpButton from './PanelHelpButton.tsx'
import FloatingShell from './FloatingShell.tsx'
import { openFloat } from '../lib/floatingWindowStore.ts'
import { visitorState } from '../lib/visitorStore.ts'

const FLOAT_ID = 'app-preview'

const DEFAULT_PROMPT = 'ACME Order'

const STATUS_LABEL: Record<string, string> = {
  idle: 'idle',
  building: 'building…',
  ready: 'ready',
  error: 'error',
}

const TABS: Array<{ id: PreviewTab; label: string }> = [
  { id: 'preview', label: 'App Preview' },
  { id: 'source', label: 'Source Code' },
  { id: 'artifacts', label: 'Artifacts / Telemetry' },
]

type FrameMode = 'mobile' | 'desktop'

export default function AppPreview() {
  const sandbox = sandboxStore
  const [frameMode, setFrameMode] = createSignal<FrameMode>('mobile')
  let frameRef: HTMLIFrameElement | undefined

  onMount(() => {
    if (!frameRef) return
    const detach = sandbox.attachFrame(frameRef)
    onCleanup(detach)

    const disconnect = sandbox.connectGenerator(DEFAULT_PROMPT)
    onCleanup(disconnect)
  })

  /**
   * Pass E: "prepares view routing for the active domain's preview UI" —
   * `/template <id>` (terminalCommands.ts) never force-relaunches the
   * current preview on its own (that would yank the demo out from under
   * anyone mid-interaction), but this button lets a visitor explicitly ask
   * to see the active domain's own generator output. Two of three templates
   * already have a real one (`previewScenario` in templateRegistry.ts);
   * the third ("What's For Dinner") is honestly labeled "coming soon"
   * rather than silently routing through the unrelated generic
   * default-sandbox card under a misleading domain name.
   */
  const activeTemplate = createMemo(() => {
    activeTemplateId()
    return getActiveTemplate()
  })

  function previewActiveDomain() {
    const template = activeTemplate()
    if (!template.previewScenario) return
    // Fire-and-forget, matching CookbookDropdown.tsx's established pattern
    // for a one-shot triggered build — the SSE connection closes itself
    // when the stream ends, so there's nothing to track/clean up here.
    sandbox.connectGenerator(template.previewPrompt)
  }

  return (
    <FloatingShell id={FLOAT_ID} title="App Preview" defaultWidth={460}>
    <section
      data-testid="app-preview"
      class="relative w-full max-w-2xl rounded-lg border border-border bg-surface text-left shadow-lg"
    >
      {/*
        Pinned to the section's own corner rather than embedded in the header
        row below: that row is `flex-wrap` (Save/Publish only render once a
        build is `ready`, so its content width varies), and an inline help
        button there would wrap onto its own line under realistic widths,
        landing mid-panel instead of top-right — exactly the kind of
        "looks fine when ready, breaks while building" bug that's easy to
        miss without actually loading the page.
      */}
      <div class="absolute right-3 top-2 flex items-center gap-1.5">
        <button
          type="button"
          title="Detach / Float Window"
          class="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] text-text-muted transition-colors hover:border-accent hover:text-accent"
          onClick={() => openFloat(FLOAT_ID, 460)}
        >
          ⤢
        </button>
        <PanelHelpButton title="App Preview">
          <p>
            The generated micro-app itself, running live in an isolated sandbox — plus its raw
            source and full run telemetry in the other two tabs.
          </p>
          <p class="mt-1.5">
            Once a build is ready, publish it as a real shareable link with "🚀 Publish Live App", or
            use "🎯 Preview this domain" to see the active template's own demo.
          </p>
        </PanelHelpButton>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 pl-4 pr-10">
        <div class="flex flex-wrap gap-1">
          <For each={TABS}>
            {(tab) => (
              <button
                type="button"
                class={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  sandbox.state.tab === tab.id
                    ? 'bg-surface-raised text-text'
                    : 'text-text-muted hover:text-text'
                }`}
                onClick={() => sandbox.setTab(tab.id)}
              >
                {tab.label}
              </button>
            )}
          </For>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Show when={sandbox.state.status === 'ready'}>
            <SaveRecipeModal />
            <PublishModal />
          </Show>
          <span class="shrink-0 whitespace-nowrap font-mono text-xs text-text-muted">{STATUS_LABEL[sandbox.state.status]}</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-1.5 text-[11px]">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-text-muted">
            Domain: <span class="font-medium text-text">{sandbox.state.domainLabel ?? activeTemplate().name}</span>
          </span>
          <div class="flex items-center overflow-hidden rounded border border-border">
            <button
              type="button"
              title="Desktop preview"
              class={`px-1.5 py-0.5 transition-colors ${frameMode() === 'desktop' ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'}`}
              onClick={() => setFrameMode('desktop')}
            >
              🖥️ Desktop
            </button>
            <button
              type="button"
              title="Mobile preview"
              class={`px-1.5 py-0.5 transition-colors ${frameMode() === 'mobile' ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'}`}
              onClick={() => setFrameMode('mobile')}
            >
              📱 Mobile
            </button>
          </div>
        </div>
        <Show
          when={activeTemplate().previewScenario}
          fallback={<span class="text-text-muted italic">Preview coming soon for this domain</span>}
        >
          <button
            type="button"
            class="rounded border border-accent/40 px-2 py-0.5 text-accent transition-colors hover:bg-accent/10"
            onClick={previewActiveDomain}
          >
            🎯 Preview this domain
          </button>
        </Show>
      </div>

      <Show when={sandbox.state.tab === 'preview' && policyTrajectoryState.active}>
        <div class="flex items-center justify-between gap-2 border-b border-border bg-surface-raised px-4 py-2 text-[11px]">
          <div class="flex items-center gap-1.5">
            <For each={TRAJECTORY_STAGES}>
              {(label, i) => (
                <>
                  <Show when={i() > 0}>
                    <span
                      class={`h-px w-4 transition-colors duration-300 ${
                        policyTrajectoryState.stage >= i() ? 'bg-accent' : 'bg-border'
                      }`}
                    />
                  </Show>
                  <span
                    class={`rounded-full px-2 py-0.5 font-medium transition-colors duration-300 ${
                      policyTrajectoryState.stage === i()
                        ? 'animate-pulse bg-accent text-slate-950'
                        : policyTrajectoryState.stage > i()
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-border/40 text-text-muted'
                    }`}
                  >
                    {label}
                    {i() === 1 ? ` ($${policyTrajectoryState.total.toFixed(0)} · ${decisionLabel(policyTrajectoryState.decision)})` : ''}
                  </span>
                </>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/*
        UAT fix: the sandboxed preview renders inside a mock device shell
        (status bar + rounded device border) in "Mobile" mode, so App Preview
        reads as "a phone showing your app" instead of "an embedded webpage."
        The status bar's time is deliberately a static mock (matching the
        classic App Store screenshot convention), not a live clock — chrome,
        not a feature. "Desktop" mode drops that chrome for a plain
        browser-like rectangle instead.

        The chrome is toggled with `classList` on a single always-mounted
        wrapper rather than swapping between two `<Show>` branches — the
        iframe itself (and the live sandbox document inside it) must never
        remount when flipping the toggle, same reasoning as FloatingShell.tsx
        not remounting a panel's DOM subtree on detach/re-dock. No new scroll
        container is introduced (the iframe still just fills the frame's
        remaining height), so there's still exactly one scrollbar: whatever
        the generated app's own document produces internally.
      */}
      <div class="h-80 bg-bg p-3" classList={{ hidden: sandbox.state.tab !== 'preview' }}>
        <div
          class="flex h-full flex-col overflow-hidden border shadow-lg"
          classList={{
            'rounded-2xl border-slate-700/80 bg-slate-900/90 shadow-2xl': frameMode() === 'mobile',
            'rounded-lg border-border bg-white': frameMode() === 'desktop',
          }}
        >
          <div
            class="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 text-[10px] font-medium text-slate-300"
            classList={{ hidden: frameMode() !== 'mobile' }}
          >
            <span class="font-mono">9:41</span>
            <div class="flex items-center gap-2">
              <span aria-hidden="true">📶</span>
              <span aria-hidden="true">🔋</span>
              <span class="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-slate-200">
                👤 {visitorState.identity?.handle ?? 'Visitor'}
              </span>
            </div>
          </div>
          <div class="min-h-0 flex-1 overflow-hidden bg-white">
            <iframe
              ref={frameRef}
              src={SANDBOX_FRAME_PATH}
              sandbox="allow-scripts"
              title="App sandbox preview"
              class="h-full w-full"
            />
          </div>
        </div>
      </div>

      <div
        class="h-80 overflow-auto rounded-b-lg bg-bg px-4 py-3"
        classList={{ hidden: sandbox.state.tab !== 'source' }}
      >
        <pre class="font-mono text-xs whitespace-pre-wrap text-text-muted">
          <code>{sandbox.state.code || '// no source yet'}</code>
        </pre>
      </div>

      <div class="h-80 overflow-hidden rounded-b-lg bg-bg" classList={{ hidden: sandbox.state.tab !== 'artifacts' }}>
        <ArtifactsPanel />
      </div>

      {sandbox.state.errorMessage && (
        <p class="border-t border-border px-4 py-2 font-mono text-xs text-red-400">
          {sandbox.state.errorMessage}
        </p>
      )}
    </section>
    </FloatingShell>
  )
}
