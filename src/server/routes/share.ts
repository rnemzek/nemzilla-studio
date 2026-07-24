import type { Context } from 'hono'
import { getPublishedApp } from '../services/publishedAppStore.ts'

/**
 * Plan C UOW-3: GET /share/:slug — the public, zero-auth edge route serving
 * a published app's already-wrapped HTML document directly (no Studio chrome,
 * no iframe). Deliberately permissive CSP scoped to this one route, mirroring
 * routes/sandboxFrame.ts's exemption: the published document needs the
 * Tailwind CDN script and whatever inline `<script>` the generator embedded,
 * neither of which the site-wide strict CSP (`script-src 'self'`) would
 * allow. Unlike the sandbox iframe, this is a real top-level page at a real
 * origin — not a security concern, since there's no parent page's
 * cookies/storage to protect here the way there is for the sandboxed studio
 * preview.
 */
const SHARE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdn.tailwindcss.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
].join('; ')

export async function shareAppHandler(c: Context) {
  const slug = c.req.param('slug')
  const app = slug ? await getPublishedApp(slug) : null
  if (!app) return c.text('Not found — this link may have expired or never existed.', 404)

  c.header('Content-Security-Policy', SHARE_CSP)
  c.header('X-Content-Type-Options', 'nosniff')
  return c.html(app.htmlPayload)
}
