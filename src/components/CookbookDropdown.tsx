import { For, Show, createSignal } from 'solid-js'
import { COOKBOOK_PRESETS } from '../lib/cookbookPresets.ts'
import { sandboxStore } from '../lib/sandboxStore.ts'
import { recipeState } from '../lib/recipeStore.ts'

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
