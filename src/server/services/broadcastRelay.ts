/**
 * Passive event-bus listener: relays every broadcast-tagged pipeline event
 * onto the shared SSE fan-out (sessionManager.broadcastFrame), reaching the
 * builder connection and every spectator. Registers itself on import — see
 * daemons.ts.
 */
import { broadcastFrame } from './sessionManager.ts'
import { onPipelineEvent } from './eventBus.ts'

onPipelineEvent((event) => {
  if (event.broadcast === undefined) return
  broadcastFrame(event.name, event.broadcast)
})
