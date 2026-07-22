import { createStore } from 'solid-js/store'

export type SessionRole = 'builder' | 'spectator'

interface SessionRoleState {
  builderCount: number
  spectatorCount: number
}

const [state, setState] = createStore<SessionRoleState>({ builderCount: 0, spectatorCount: 0 })

export const sessionRoleState = state

/**
 * Any component that opens a /api/agent/stream or /api/agent/spectate
 * connection calls this once it receives that connection's `session_role`
 * frame, so the header badge can reflect whether *this browser tab* is
 * currently driving the single active build or just watching it. Returns a
 * cleanup function to call when that connection ends.
 */
export function reportRole(role: SessionRole): () => void {
  const key = role === 'builder' ? 'builderCount' : 'spectatorCount'
  setState(key, (n) => n + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    setState(key, (n) => Math.max(0, n - 1))
  }
}

/** `builder` takes visual priority over `spectator`; `null` means no active connection reported a role yet. */
export function currentRoleBadge(): SessionRole | null {
  if (state.builderCount > 0) return 'builder'
  if (state.spectatorCount > 0) return 'spectator'
  return null
}
