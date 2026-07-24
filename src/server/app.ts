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
import { poInterviewHandler, poInterviewMetaHandler } from './routes/poInterview.ts'
import { submitFeedbackHandler, listFeedbackHandler } from './routes/feedback.ts'
import { touchVisitorHandler } from './routes/visitor.ts'
import { listSessionsAdminHandler, getSessionDetailAdminHandler } from './routes/admin.ts'
import { publishAppHandler } from './routes/publish.ts'
import { shareAppHandler } from './routes/share.ts'

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
  .post('/api/po/interview', (c) => poInterviewHandler(c))
  .get('/api/po/interview/meta', (c) => poInterviewMetaHandler(c))
  .get('/api/bible', (c) => getBibleHandler(c))
  .post('/api/feedback', (c) => submitFeedbackHandler(c))
  .get('/api/feedback', (c) => listFeedbackHandler(c))
  .post('/api/visitor/touch', (c) => touchVisitorHandler(c))
  .get('/api/admin/sessions', (c) => listSessionsAdminHandler(c))
  .get('/api/admin/sessions/:visitorId', (c) => getSessionDetailAdminHandler(c))
  .post('/api/publish', (c) => publishAppHandler(c))
  // Path must match SANDBOX_FRAME_PATH in src/lib/sandboxTemplate.ts and the
  // exemption in securityHeaders.ts.
  .get('/sandbox-frame', sandboxFrameHandler)
  // Public edge route for published live apps — also exempted in securityHeaders.ts.
  .get('/share/:slug', (c) => shareAppHandler(c))

export default app
export type AppType = typeof app
