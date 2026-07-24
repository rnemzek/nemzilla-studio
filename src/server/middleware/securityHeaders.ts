import type { MiddlewareHandler } from 'hono'

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

// Strict CSP/HSTS only make sense once we're actually served over HTTPS in
// prod — applying HSTS to plain-HTTP dev traffic would just be misleading.
export const securityHeaders = (): MiddlewareHandler => {
  const isProduction = process.env.NODE_ENV === 'production'

  return async (c, next) => {
    await next()

    if (!isProduction) return

    // The sandbox iframe shim and published /share/:slug pages each need
    // their own permissive CSP (Tailwind CDN, inline generated code) — they
    // set that themselves in routes/sandboxFrame.ts/routes/share.ts, so skip
    // the strict site-wide policy here rather than clobbering it (this
    // middleware's headers are applied after the route handler's, since
    // they're set post-`next()`).
    if (c.req.path === '/sandbox-frame' || c.req.path.startsWith('/share/')) return

    c.header('Content-Security-Policy', CSP_DIRECTIVES)
    c.header('X-Frame-Options', 'DENY')
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  }
}
