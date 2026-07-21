import { Hono } from 'hono'
import { agentStreamHandler } from './services/agentStream.ts'
import { securityHeaders } from './middleware/securityHeaders.ts'

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

export default app
export type AppType = typeof app
