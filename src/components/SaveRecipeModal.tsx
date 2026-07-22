import { For, Show, createSignal } from 'solid-js'
import { sandboxStore } from '../lib/sandboxStore.ts'
import { RECIPE_CATEGORIES, saveRecipe, type RecipeCategory } from '../lib/recipeStore.ts'

export default function SaveRecipeModal() {
  const [isOpen, setIsOpen] = createSignal(false)
  const [name, setName] = createSignal('')
  const [description, setDescription] = createSignal('')
  const [category, setCategory] = createSignal<RecipeCategory>('Custom Workflow')
  const [saving, setSaving] = createSignal(false)
  const [savedMessage, setSavedMessage] = createSignal<string | null>(null)

  function openModal() {
    setName('')
    setDescription('')
    setCategory('Custom Workflow')
    setSavedMessage(null)
    setIsOpen(true)
  }

  async function handleSave(event: Event) {
    event.preventDefault()
    const trimmedName = name().trim()
    if (!trimmedName || saving()) return

    setSaving(true)
    try {
      await saveRecipe({
        name: trimmedName,
        description: description().trim(),
        category: category(),
        code: sandboxStore.state.code,
      })
      setSavedMessage(`Saved "${trimmedName}" to your Cookbook.`)
      setTimeout(() => setIsOpen(false), 900)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        class="whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-text"
        onClick={openModal}
      >
        💾 Save to Cookbook
      </button>

      <Show when={isOpen()}>
        <div
          class="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            class="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div class="mb-4 flex items-center justify-between border-b border-border pb-3">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-text-muted">Save to Cookbook</h2>
              <button type="button" class="text-text-muted hover:text-text" onClick={() => setIsOpen(false)}>
                ✕
              </button>
            </div>

            <form class="space-y-3" onSubmit={handleSave}>
              <label class="block text-sm text-text-muted">
                Recipe Name
                <input
                  type="text"
                  required
                  value={name()}
                  onInput={(event) => setName(event.currentTarget.value)}
                  class="mt-1 w-full rounded-md border border-border bg-surface-raised p-2 text-sm text-text"
                  placeholder="e.g. ACME Order — $250 ceiling"
                />
              </label>

              <label class="block text-sm text-text-muted">
                Description
                <textarea
                  value={description()}
                  onInput={(event) => setDescription(event.currentTarget.value)}
                  rows={3}
                  class="mt-1 w-full rounded-md border border-border bg-surface-raised p-2 text-sm text-text"
                  placeholder="What makes this run worth saving?"
                />
              </label>

              <label class="block text-sm text-text-muted">
                Category Tag
                <select
                  value={category()}
                  onChange={(event) => setCategory(event.currentTarget.value as RecipeCategory)}
                  class="mt-1 w-full rounded-md border border-border bg-surface-raised p-2 text-sm text-text"
                >
                  <For each={RECIPE_CATEGORIES}>{(cat) => <option value={cat}>{cat}</option>}</For>
                </select>
              </label>

              <button
                type="submit"
                disabled={saving() || !name().trim()}
                class="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
              >
                {saving() ? 'Saving…' : 'Save Recipe'}
              </button>

              <Show when={savedMessage()}>
                <p class="text-center text-xs text-emerald-400">{savedMessage()}</p>
              </Show>
            </form>
          </div>
        </div>
      </Show>
    </>
  )
}
