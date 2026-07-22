import { Hono } from 'hono'
// Side-effect import: registers the Audit/Notifier/Artifact Recorder/Broadcast
// daemons on the shared event bus before any request can emit an event.
import './services/daemons.ts'
import { agentStreamHandler } from './services/agentStream.ts'
import { auditStreamHandler } from './services/auditLedger.ts'
import { securityHeaders } from './middleware/securityHeaders.ts'
import { sandboxFrameHandler } from './routes/sandboxFrame.ts'
import { spectatorStreamHandler } from './routes/spectatorStream.ts'
import { getSessionHandler, listSessionsHandler, saveRecipeHandler } from './routes/sessions.ts'
import { getBibleHandler } from './routes/bible.ts'
import { getSessionBundleHandler, putSessionBundleArtifactHandler } from './routes/sessionBundle.ts'
import { orderEventHandler } from './routes/orders.ts'

const app = new Hono()
  .use('*', securityHeaders())
  .get('/api/health', (c) =>
    c.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  )
  .get('/api/agent/stream', (c) => agentStreamHandler(c))
  .get('/api/agent/spectate', (c) => spectatorStreamHandler(c))
  .get('/api/audit/stream', (c) => auditStreamHandler(c))
  .get('/api/sessions', (c) => listSessionsHandler(c))
  .get('/api/sessions/:id', (c) => getSessionHandler(c))
  .post('/api/sessions/save-recipe', (c) => saveRecipeHandler(c))
  .get('/api/sessions/:id/bundle', (c) => getSessionBundleHandler(c))
  .put('/api/sessions/:id/bundle', (c) => putSessionBundleArtifactHandler(c))
  .post('/api/orders/event', (c) => orderEventHandler(c))
  .get('/api/bible', (c) => getBibleHandler(c))
  // Path must match SANDBOX_FRAME_PATH in src/lib/sandboxTemplate.ts and the
  // exemption in securityHeaders.ts.
  .get('/sandbox-frame', sandboxFrameHandler)

export default app
export type AppType = typeof app
