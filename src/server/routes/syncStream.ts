import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { broadcastToRoom, getRoomState, subscribeToRoom, type SyncFrame } from '../services/syncRoomManager.ts'

/**
 * UOW-6.2: GET /api/sync/:roomId — an SSE subscriber for one multi-device
 * sync room. Mirrors agentStream.ts's serveSessionStream: seed a `pending`
 * queue with the room's last-known task state, then subscribe synchronously
 * (no `await` between the two) so a concurrently-broadcast frame can't fall
 * through the gap.
 */
export function syncStreamHandler(c: Context) {
  const roomId = c.req.param('roomId')
  if (!roomId) return c.text('roomId is required', 400)

  return streamSSE(c, async (stream) => {
    let eventId = 0
    let closed = false
    stream.onAbort(() => {
      closed = true
    })

    const send = (event: string, data: unknown) => stream.writeSSE({ event, id: String(eventId++), data: JSON.stringify(data) })

    const pending: SyncFrame[] = []
    const initialTasks = getRoomState(roomId)
    if (initialTasks !== null) pending.push({ event: 'state', data: { tasks: initialTasks } })

    let wake = () => {}
    const unsubscribe = subscribeToRoom(roomId, (frame) => {
      pending.push(frame)
      wake()
    })
    stream.onAbort(() => unsubscribe())

    while (!closed) {
      while (pending.length > 0) {
        const frame = pending.shift()!
        await send(frame.event, frame.data)
      }
      if (closed) return
      await new Promise<void>((resolve) => {
        wake = resolve
        stream.onAbort(resolve)
      })
      wake = () => {}
    }
  })
}

/** POST /api/sync/:roomId — a task mutation on one device, broadcast to every other subscriber of the same room. */
export async function syncBroadcastHandler(c: Context) {
  const roomId = c.req.param('roomId')
  if (!roomId) return c.json({ error: 'roomId is required' }, 400)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const tasks = (body as { tasks?: unknown } | null)?.tasks
  if (tasks === undefined) return c.json({ error: 'tasks is required' }, 400)

  broadcastToRoom(roomId, tasks)
  return c.json({ ok: true })
}
