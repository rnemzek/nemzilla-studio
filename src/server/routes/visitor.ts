import type { Context } from 'hono'
import { isValidVisitorId, sanitizeHandle, touchVisitor } from '../services/visitorTracker.ts'

/**
 * Pass C Task 1/3: a lightweight heartbeat — called once on page load and
 * periodically while the tab is visible (see visitorStore.ts) so the Admin
 * Drawer's Session List shows real traffic, not just visitors who happened
 * to trigger an interview turn or swarm build (which also call
 * `touchVisitor()` directly at their own call sites).
 */
export async function touchVisitorHandler(c: Context) {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const { visitorId, handle } = (body ?? {}) as { visitorId?: string; handle?: string }
  if (!isValidVisitorId(visitorId)) return c.json({ error: 'invalid visitorId' }, 400)

  touchVisitor(visitorId, sanitizeHandle(handle))
  return c.json({ success: true })
}
