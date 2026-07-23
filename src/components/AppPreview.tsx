import { For, Show, onCleanup, onMount } from 'solid-js'
import { sandboxStore, type PreviewTab } from '../lib/sandboxStore.ts'
import { SANDBOX_FRAME_PATH } from '../lib/sandboxTemplate.ts'
import { policyTrajectoryState, TRAJECTORY_STAGES, decisionLabel } from '../lib/policyTrajectoryStore.ts'
import SaveRecipeModal from './SaveRecipeModal.tsx'
import ArtifactsPanel from './ArtifactsPanel.tsx'

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

export default function AppPreview() {
  const sandbox = sandboxStore
  let frameRef: HTMLIFrameElement | undefined

  onMount(() => {
    if (!frameRef) return
    const detach = sandbox.attachFrame(frameRef)
    onCleanup(detach)

    const disconnect = sandbox.connectGenerator(DEFAULT_PROMPT)
    onCleanup(disconnect)
  })

  return (
    <section
      data-testid="app-preview"
      class="w-full max-w-2xl rounded-lg border border-border bg-surface text-left shadow-lg"
    >
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
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
        <div class="flex shrink-0 items-center gap-2">
          <Show when={sandbox.state.status === 'ready'}>
            <SaveRecipeModal />
          </Show>
          <span class="shrink-0 whitespace-nowrap font-mono text-xs text-text-muted">{STATUS_LABEL[sandbox.state.status]}</span>
        </div>
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

      <div class="h-80" classList={{ hidden: sandbox.state.tab !== 'preview' }}>
        <iframe
          ref={frameRef}
          src={SANDBOX_FRAME_PATH}
          sandbox="allow-scripts"
          title="App sandbox preview"
          class="h-full w-full rounded-b-lg bg-white"
        />
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
  )
}
