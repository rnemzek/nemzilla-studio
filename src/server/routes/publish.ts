import type { Context } from 'hono'
import { publishApp, isValidSlug } from '../services/publishedAppStore.ts'
import { isValidVisitorId, sanitizeHandle, touchVisitor, addMilestone } from '../services/visitorTracker.ts'
import { sendHighValueAlert } from '../services/webhookNotifier.ts'

/**
 * Plan C UOW-3/4: POST /api/publish — persists a generated app's full HTML
 * document (already envelope-wrapped client-side via buildSandboxDocument,
 * the same helper the sandbox iframe itself uses) and returns the
 * `/share/:slug` path the Deployment Modal turns into a link + QR code.
 * Publishing is treated as a high-intent visitor action the same way a
 * completed swarm build or a "would you hire me" submission already are
 * (visitorTracker.ts's milestones, webhookNotifier.ts's alert) — arguably
 * the highest-intent action this app has, since it produces something the
 * visitor can carry away and show someone else.
 */
export async function publishAppHandler(c: Context) {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const { slug, title, htmlPayload, visitorId, handle } = (body ?? {}) as {
    slug?: unknown
    title?: unknown
    htmlPayload?: unknown
    visitorId?: unknown
    handle?: unknown
  }

  if (typeof title !== 'string' || !title.trim()) return c.json({ error: 'title is required' }, 400)
  if (typeof htmlPayload !== 'string' || !htmlPayload.trim()) return c.json({ error: 'htmlPayload is required' }, 400)
  if (slug !== undefined && !isValidSlug(slug)) return c.json({ error: 'invalid slug' }, 400)

  const safeVisitorId = isValidVisitorId(visitorId) ? visitorId : null
  const safeHandle = safeVisitorId ? sanitizeHandle(handle) : null

  const result = await publishApp({
    slug: typeof slug === 'string' ? slug : undefined,
    title,
    htmlPayload,
    visitorId: safeVisitorId,
    handle: safeHandle,
  })

  if ('error' in result) return c.json({ error: result.error }, 400)

  if (safeVisitorId) {
    touchVisitor(safeVisitorId, safeHandle ?? 'Anonymous Visitor')
    addMilestone(safeVisitorId, 'App Published')
    sendHighValueAlert(`🚀 ${safeHandle ?? 'A visitor'} published a live app: "${result.app.title}" (/share/${result.app.slug})`, {
      visitorId: safeVisitorId,
      handle: safeHandle,
      slug: result.app.slug,
    })
  }

  return c.json({ slug: result.app.slug, shareUrl: `/share/${result.app.slug}` })
}
