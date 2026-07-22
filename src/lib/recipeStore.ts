import { createStore } from 'solid-js/store'

export const RECIPE_CATEGORIES = ['Governance', 'Live Web Fetch', 'Custom Workflow'] as const
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number]

export interface Recipe {
  id: string
  name: string
  description: string
  category: RecipeCategory
  code: string
  createdAt: string
}

const STORAGE_KEY = 'nemzilla-studio:recipes'

function loadFromStorage(): Recipe[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Recipe[]) : []
  } catch {
    return []
  }
}

function persistToStorage(recipes: Recipe[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes))
  } catch (err) {
    console.error('recipeStore: failed to persist to localStorage', err)
  }
}

const [state, setState] = createStore<{ recipes: Recipe[] }>({ recipes: loadFromStorage() })

/** Reactive — CookbookDropdown.tsx reads this directly for the "My Saved Recipes" section. */
export const recipeState = state

export interface SaveRecipeInput {
  name: string
  description: string
  category: RecipeCategory
  code: string
}

/**
 * Saves a recipe to localStorage immediately (so it's available for instant
 * replay without a network round trip), then archives it server-side via
 * POST /api/sessions/save-recipe for durability — best-effort, logged but
 * non-fatal if it fails, since the localStorage copy is already the source
 * of truth for this browser's Cookbook display.
 */
export async function saveRecipe(input: SaveRecipeInput): Promise<Recipe> {
  const recipe: Recipe = {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description,
    category: input.category,
    code: input.code,
    createdAt: new Date().toISOString(),
  }

  const next = [recipe, ...state.recipes]
  setState('recipes', next)
  persistToStorage(next)

  try {
    const res = await fetch(`${window.location.origin}/api/sessions/save-recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recipe),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    console.error('recipeStore: failed to archive recipe to the server', err)
  }

  return recipe
}
