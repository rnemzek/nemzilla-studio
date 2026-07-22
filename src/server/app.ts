import { Hono } from 'hono'
import { agentStreamHandler } from './services/agentStream.ts'
import { auditStreamHandler } from './services/auditLedger.ts'
import { securityHeaders } from './middleware/securityHeaders.ts'
import { sandboxFrameHandler } from './routes/sandboxFrame.ts'

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
  .get('/api/audit/stream', (c) => auditStreamHandler(c))
  // Path must match SANDBOX_FRAME_PATH in src/lib/sandboxTemplate.ts and the
  // exemption in securityHeaders.ts.
  .get('/sandbox-frame', sandboxFrameHandler)

export default app
export type AppType = typeof app
