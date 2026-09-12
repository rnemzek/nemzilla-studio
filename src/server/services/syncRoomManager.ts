/**
 * UOW-6.2: an in-memory, per-room pub/sub for the generated TODO app's
 * multi-device sync — the same shape as sessionManager.ts's global
 * subscribe/broadcastFrame pair, just keyed by `roomId` instead of one
 * global session. Lightweight by design (an in-memory Map, no persistence):
 * a sync room is a live, ephemeral broadcast channel, not durable state —
 * unlike publishedAppStore.ts's file-backed app content, losing a room's
 * last-known task state on a server restart is an acceptable trade-off for
 * this demo-scope feature.
 */
export interface SyncFrame {
  event: string
  data: unknown
}

interface Room {
  subscribers: Set<(frame: SyncFrame) => void>
  lastTasks: unknown | null
}

const rooms = new Map<string, Room>()

function getOrCreateRoom(roomId: string): Room {
  let room = rooms.get(roomId)
  if (!room) {
    room = { subscribers: new Set(), lastTasks: null }
    rooms.set(roomId, room)
  }
  return room
}

/** Drops rooms nobody is listening to and that never received a task broadcast — avoids unbounded growth from clients that open a stream for a room that's never actually used. */
function pruneIfEmpty(roomId: string, room: Room): void {
  if (room.subscribers.size === 0 && room.lastTasks === null) rooms.delete(roomId)
}

/** Called by a client's task mutation POST — updates the room's last-known state and fans it out to every connected SSE subscriber. */
export function broadcastToRoom(roomId: string, tasks: unknown): void {
  const room = getOrCreateRoom(roomId)
  room.lastTasks = tasks
  const frame: SyncFrame = { event: 'state', data: { tasks } }
  for (const notify of room.subscribers) notify(frame)
}

/** The room's most recently broadcast task state, sent to a newly connecting client so it doesn't start blank while waiting for the next mutation elsewhere. */
export function getRoomState(roomId: string): unknown | null {
  return rooms.get(roomId)?.lastTasks ?? null
}

export function subscribeToRoom(roomId: string, cb: (frame: SyncFrame) => void): () => void {
  const room = getOrCreateRoom(roomId)
  room.subscribers.add(cb)
  return () => {
    room.subscribers.delete(cb)
    pruneIfEmpty(roomId, room)
  }
}
