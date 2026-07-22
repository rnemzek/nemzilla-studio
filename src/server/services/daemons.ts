/**
 * Central import point for the passive event-bus daemons. Importing this
 * module once (from app.ts, at server startup) registers every daemon's
 * listener on the shared bus before any pipeline event can fire. Nothing
 * else in the codebase imports the daemon modules directly — they act only
 * through their onPipelineEvent() side effect.
 */
import './broadcastRelay.ts'
import './auditDaemon.ts'
import './notifierDaemon.ts'
import './artifactRecorderDaemon.ts'
