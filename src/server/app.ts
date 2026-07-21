import { Hono } from 'hono'
import { agentStreamHandler } from './services/agentStream.ts'

const app = new Hono()
  .basePath('/api')
  .get('/health', (c) =>
    c.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  )
  .get('/agent/stream', (c) => agentStreamHandler(c))

export default app
export type AppType = typeof app
