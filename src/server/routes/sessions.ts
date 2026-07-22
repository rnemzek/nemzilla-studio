import type { Context } from 'hono'
import { listSavedSessions, loadSession } from '../services/sessionSerializer.ts'
import { isValidRecipeId, RECIPE_CATEGORIES, saveRecipe, type RecipeRecord } from '../services/recipeSerializer.ts'

const RECIPE_CATEGORY_SET: Set<string> = new Set(RECIPE_CATEGORIES)
const MAX_NAME_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 2000
const MAX_CODE_LENGTH = 200_000

export async function listSessionsHandler(c: Context) {
  const summaries = await listSavedSessions()
  return c.json({ sessions: summaries })
}

export async function getSessionHandler(c: Context) {
  const sessionId = c.req.param('id')
  const record = sessionId ? await loadSession(sessionId) : null
  if (!record) return c.json({ error: 'session not found' }, 404)
  return c.json(record)
}

export async function saveRecipeHandler(c: Context) {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const { id, name, description, category, code } = (body ?? {}) as Partial<RecipeRecord>

  if (typeof id !== 'string' || !isValidRecipeId(id)) return c.json({ error: 'invalid or missing id' }, 400)
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > MAX_NAME_LENGTH) {
    return c.json({ error: 'invalid name' }, 400)
  }
  if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_LENGTH) {
    return c.json({ error: 'invalid description' }, 400)
  }
  if (typeof category !== 'string' || !RECIPE_CATEGORY_SET.has(category)) {
    return c.json({ error: 'invalid category' }, 400)
  }
  if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE_LENGTH) {
    return c.json({ error: 'invalid code' }, 400)
  }

  const record: RecipeRecord = {
    id,
    name: name.trim(),
    description: description.trim(),
    category: category as RecipeRecord['category'],
    code,
    createdAt: new Date().toISOString(),
  }

  await saveRecipe(record)
  return c.json({ success: true, id: record.id })
}
