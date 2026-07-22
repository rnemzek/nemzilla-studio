import http from 'node:http'
import { serve, getRequestListener } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createServer as createViteServer } from 'vite'
import app from './src/server/app.ts'

const isProduction = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT ?? 3000)

async function main() {
  if (isProduction) {
    app.use('/*', serveStatic({ root: './dist' }))
    app.get('*', serveStatic({ path: './dist/index.html' }))

    serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
      console.log(`NemZilla Studio listening on http://localhost:${info.port}`)
    })
    return
  }

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  })
  const honoListener = getRequestListener(app.fetch)

  const server = http.createServer((req, res) => {
    // /sandbox-frame is Hono-served too (see src/server/routes/sandboxFrame.ts) —
    // otherwise Vite's SPA middleware would serve index.html for it instead.
    if (req.url?.startsWith('/api') || req.url?.startsWith('/sandbox-frame')) {
      honoListener(req, res)
      return
    }
    vite.middlewares(req, res)
  })

  server.listen(port, () => {
    console.log(`NemZilla Studio dev server running at http://localhost:${port}`)
  })
}

main()
