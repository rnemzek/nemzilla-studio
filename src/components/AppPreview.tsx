import { For, onCleanup, onMount } from 'solid-js'
import { createSandboxStore, type PreviewTab } from '../lib/sandboxStore.ts'
import { SANDBOX_FRAME_PATH } from '../lib/sandboxTemplate.ts'

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
]

export default function AppPreview() {
  const sandbox = createSandboxStore()
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
      <div class="flex items-center justify-between border-b border-border px-4 py-2">
        <div class="flex gap-1">
          <For each={TABS}>
            {(tab) => (
              <button
                type="button"
                class={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
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
        <span class="font-mono text-xs text-text-muted">{STATUS_LABEL[sandbox.state.status]}</span>
      </div>

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

      {sandbox.state.errorMessage && (
        <p class="border-t border-border px-4 py-2 font-mono text-xs text-red-400">
          {sandbox.state.errorMessage}
        </p>
      )}
    </section>
  )
}
