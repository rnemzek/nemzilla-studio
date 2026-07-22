import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const RECIPE_CATEGORIES = ['Governance', 'Live Web Fetch', 'Custom Workflow'] as const
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number]

export interface RecipeRecord {
  id: string
  name: string
  description: string
  category: RecipeCategory
  code: string
  createdAt: string
}

const DEMOS_DIR = path.join(process.cwd(), '.codex', 'demos')

/** UUIDs only — `id` reaches here from a client-submitted POST body, and a file path is built from it. */
const RECIPE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidRecipeId(id: string): boolean {
  return RECIPE_ID_PATTERN.test(id)
}

function recipeFilePath(id: string): string {
  // "custom-" prefix keeps user-curated recipes distinguishable from
  // auto-serialized build runs in the same .codex/demos/ directory —
  // sessionSerializer.ts's listSavedSessions() explicitly skips this prefix
  // so the two "AgentZ Cookbook" sections in the dropdown stay separate.
  return path.join(DEMOS_DIR, `custom-${id}.json`)
}

export async function saveRecipe(record: RecipeRecord): Promise<void> {
  if (!isValidRecipeId(record.id)) throw new Error('invalid recipe id')
  await mkdir(DEMOS_DIR, { recursive: true })
  await writeFile(recipeFilePath(record.id), JSON.stringify(record, null, 2), 'utf8')
}
