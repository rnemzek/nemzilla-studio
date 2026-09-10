import { For, Show, createSignal } from 'solid-js'
import { COOKBOOK_PRESETS, STACKRYN_INGEST_PRESETS } from '../lib/cookbookPresets.ts'
import { sandboxStore } from '../lib/sandboxStore.ts'
import { recipeState } from '../lib/recipeStore.ts'
import { triggerStackrynIngest } from '../lib/stackrynIngestClient.ts'
import { setStackrynLoading, setStackrynResult } from '../lib/stackrynDashboardStore.ts'

interface SavedSessionSummary {
  sessionId: string
  scenario: string
  prompt: string
  timestamp: string
}

export default function CookbookDropdown() {
  const [isOpen, setIsOpen] = createSignal(false)
  const [savedSessions, setSavedSessions] = createSignal<SavedSessionSummary[]>([])
  const [loadingSaved, setLoadingSaved] = createSignal(false)
  const [ingestingId, setIngestingId] = createSignal<string | null>(null)
  const [ingestStatus, setIngestStatus] = createSignal<string | null>(null)

  async function open() {
    setIsOpen(true)
    setLoadingSaved(true)
    try {
      const res = await fetch(`${window.location.origin}/api/sessions`)
      const body = (await res.json()) as { sessions?: SavedSessionSummary[] }
      setSavedSessions(body.sessions ?? [])
    } catch {
      setSavedSessions([])
    } finally {
      setLoadingSaved(false)
    }
  }

  function toggle() {
    if (isOpen()) setIsOpen(false)
    else void open()
  }

  function launchPreset(prompt: string) {
    sandboxStore.connectGenerator(prompt)
    setIsOpen(false)
  }

  async function replaySession(sessionId: string) {
    try {
      const res = await fetch(`${window.location.origin}/api/sessions/${sessionId}`)
      if (!res.ok) return
      const record = (await res.json()) as { code?: string }
      if (typeof record.code === 'string') sandboxStore.setCode(record.code)
    } finally {
      setIsOpen(false)
    }
  }

  function replayRecipe(code: string) {
    sandboxStore.setCode(code)
    setIsOpen(false)
  }

  const STACKRYN_BUNDLE_ID = 'stackryn-bundle'

  /**
   * UOW-2.0/3.0/4.0: unlike `launchPreset` above, this doesn't touch
   * AppPreview/the sandbox iframe at all — it fires the Stackryn ingest
   * pipeline (PLANNING -> PARSING -> EVALUATING -> DONE) for each preset in
   * the bundle in turn, which broadcasts over `/api/agent/stream` for
   * SwarmCanvas.tsx's always-on spectator connection to pick up live,
   * records each result to the Cryptographic Audit Ledger, and pushes the
   * resulting ModernizationDashboardPayload into stackrynDashboardStore for
   * StackrynCockpitPanel.tsx to render. The dropdown stays open so the
   * status line is visible.
   */
  async function launchStackrynBundle() {
    setIngestingId(STACKRYN_BUNDLE_ID)
    setStackrynLoading(STACKRYN_BUNDLE_ID)
    setIngestStatus(null)
    try {
      for (const preset of STACKRYN_INGEST_PRESETS) {
        setIngestStatus(`Ingesting ${preset.label} (${preset.format.toUpperCase()})…`)
        const response = await triggerStackrynIngest(preset)
        setStackrynResult(response)
        if (response.result.policyStatus !== 'allowed') {
          setIngestStatus(`✗ ${preset.label}: ${response.result.reason ?? response.result.policyStatus}`)
          return
        }
      }
      setIngestStatus('✓ Ingest Project Horizon Bundle complete — see the Modernization Cockpit panel')
    } catch (err) {
      setStackrynLoading(null)
      setIngestStatus(`✗ Ingest Project Horizon Bundle: ${err instanceof Error ? err.message : 'ingest failed'}`)
    } finally {
      setIngestingId(null)
    }
  }

  return (
    <div class="relative">
      <button
        type="button"
        class="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-accent hover:text-text"
        onClick={toggle}
      >
        Preset Cookbook ▾
      </button>

      <Show when={isOpen()}>
        <div class="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
        <div class="absolute right-0 z-20 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-lg border border-border bg-surface p-2 text-left shadow-xl">
          <p class="px-2 py-1 text-xs uppercase tracking-wide text-text-muted">Flagship scenarios</p>
          <For each={COOKBOOK_PRESETS}>
            {(preset) => (
              <button
                type="button"
                class="block w-full rounded-md px-2 py-1.5 text-left text-sm text-text hover:bg-surface-raised"
                onClick={() => launchPreset(preset.prompt)}
              >
                <span class="block font-medium">{preset.label}</span>
                <span class="block text-xs text-text-muted">{preset.description}</span>
              </button>
            )}
          </For>

          <div class="my-2 border-t border-border" />
          <p class="px-2 py-1 text-xs uppercase tracking-wide text-text-muted">Stackryn: Project Horizon Cockpit</p>
          <button
            type="button"
            disabled={ingestingId() === STACKRYN_BUNDLE_ID}
            class="block w-full rounded-md px-2 py-1.5 text-left text-sm text-text hover:bg-surface-raised disabled:opacity-60"
            onClick={() => launchStackrynBundle()}
          >
            <span class="block font-medium">Ingest Project Horizon Bundle</span>
            <span class="mt-1 flex flex-wrap gap-1">
              <span class="rounded border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-muted">PDF RFP</span>
              <span class="rounded border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-muted">CSV Matrix</span>
              <span class="rounded border border-border bg-surface-raised px-1.5 py-0.5 text-[10px] text-text-muted">TXT Constraints</span>
            </span>
            <span class="mt-1 block text-xs text-text-muted">
              {ingestingId() === STACKRYN_BUNDLE_ID ? 'Ingesting…' : '3 discovery artifacts — PDF + CSV + TXT'}
            </span>
          </button>
          <Show when={ingestStatus()}>
            <p class="px-2 py-1 text-xs text-text-muted">{ingestStatus()}</p>
          </Show>

          <div class="my-2 border-t border-border" />
          <p class="px-2 py-1 text-xs uppercase tracking-wide text-text-muted">AgentZ Cookbook (saved runs)</p>
          <Show
            when={!loadingSaved()}
            fallback={<p class="px-2 py-1 text-xs text-text-muted">Loading…</p>}
          >
            <Show
              when={savedSessions().length > 0}
              fallback={<p class="px-2 py-1 text-xs text-text-muted">No saved runs yet.</p>}
            >
              <For each={savedSessions()}>
                {(session) => (
                  <button
                    type="button"
                    class="block w-full rounded-md px-2 py-1.5 text-left text-sm text-text hover:bg-surface-raised"
                    onClick={() => replaySession(session.sessionId)}
                  >
                    <span class="block font-medium">{session.scenario}</span>
                    <span class="block text-xs text-text-muted">
                      {new Date(session.timestamp).toLocaleString()}
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </Show>

          <div class="my-2 border-t border-border" />
          <p class="px-2 py-1 text-xs uppercase tracking-wide text-text-muted">⭐ My Saved Recipes</p>
          <Show
            when={recipeState.recipes.length > 0}
            fallback={<p class="px-2 py-1 text-xs text-text-muted">No saved recipes yet.</p>}
          >
            <For each={recipeState.recipes}>
              {(recipe) => (
                <button
                  type="button"
                  class="block w-full rounded-md px-2 py-1.5 text-left text-sm text-text hover:bg-surface-raised"
                  onClick={() => replayRecipe(recipe.code)}
                >
                  <span class="block font-medium">{recipe.name}</span>
                  <span class="block text-xs text-text-muted">
                    {recipe.category} · {new Date(recipe.createdAt).toLocaleString()}
                  </span>
                  <Show when={recipe.description}>
                    <span class="block truncate text-xs text-text-muted/80">{recipe.description}</span>
                  </Show>
                </button>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  )
}
