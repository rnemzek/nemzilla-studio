import type { Context } from 'hono'

// Message-type strings mirror SANDBOX_MESSAGE in src/lib/sandboxTemplate.ts.
// Duplicated rather than imported: src/server and src/lib sit in separate
// tsconfig projects (tsconfig.app.json excludes src/server; tsconfig.node.json
// only includes src/server), so a cross-project import isn't viable here.
const READY = 'nemzilla:sandbox-ready'
const CODE = 'nemzilla:sandbox-code'
const RENDERED = 'nemzilla:sandbox-rendered'

// Deliberately permissive — scoped to this one route only. The real
// isolation boundary is the iframe's `sandbox="allow-scripts"` (no
// `allow-same-origin`), which forces this document into a unique opaque
// origin regardless of it being served from our own origin: it can't read
// the parent's cookies, storage, or DOM. This CSP just keeps the site-wide
// UOW-05 policy (`script-src 'self'`, `frame-ancestors 'none'`) fully strict
// for every other route by not applying it here.
const SANDBOX_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdn.tailwindcss.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' https:",
  "frame-ancestors 'self'",
].join('; ')

/**
 * Minimal bootstrap document. It carries no styling of its own — its only
 * job is to signal readiness to the parent, then replace itself via
 * `document.write` with whatever full HTML envelope (built by
 * `buildSandboxDocument` in sandboxTemplate.ts) the parent sends over
 * postMessage.
 */
function buildSandboxShim(): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script>
      window.addEventListener('message', function (event) {
        var data = event.data
        if (!data || data.type !== '${CODE}') return
        document.open()
        document.write(data.html)
        document.close()
        window.parent.postMessage({ type: '${RENDERED}' }, '*')
      })
      window.parent.postMessage({ type: '${READY}' }, '*')
    </script>
  </body>
</html>`
}

export function sandboxFrameHandler(c: Context) {
  c.header('Content-Security-Policy', SANDBOX_CSP)
  c.header('X-Content-Type-Options', 'nosniff')
  return c.html(buildSandboxShim())
}
