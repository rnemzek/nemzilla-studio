/**
 * Pass C Task 1: assigns every browser a persistent, fun default persona
 * ("Karena-Architect-402") the first time it visits, editable afterward, and
 * a lightweight `visitorId` correlating that browser's activity across
 * requests (interview turns, swarm builds, feedback) for the Admin Usage &
 * Session Drawer — see visitorTracker.ts server-side.
 *
 * The client can't see its own IP without an external call, so `visitorId`
 * hashes `navigator.userAgent` together with a random per-browser token
 * (itself a stand-in "session token", persisted alongside the handle) via
 * SHA-256/Web Crypto — the same primitive auditStore.ts already uses for
 * hash-chain verification. Truncated to 16 hex chars: "lightweight," not a
 * cryptographic identity.
 */
import { createStore } from 'solid-js/store'

export interface VisitorIdentity {
  visitorId: string
  handle: string
  createdAt: string
}

const STORAGE_KEY = 'nemzilla-studio:visitor'
const HEARTBEAT_MS = 30_000
const MAX_HANDLE_LENGTH = 60

const FIRST_NAMES = [
  'Karena', 'Roberto', 'Amara', 'Dashiell', 'Lucia', 'Kenji', 'Priya', 'Otto',
  'Sana', 'Micah', 'Yara', 'Felix', 'Nadia', 'Theo', 'Wren', 'Ines',
]
const ROLES = ['Architect', 'PO', 'Reviewer', 'Analyst', 'Builder', 'Scout', 'Planner', 'Auditor']

function randomPersona(): string {
  const name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]
  const role = ROLES[Math.floor(Math.random() * ROLES.length)]
  const num = Math.floor(Math.random() * 900) + 100
  return `${name}-${role}-${num}`
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function loadStored(): VisitorIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<VisitorIdentity>
    if (typeof parsed.visitorId === 'string' && typeof parsed.handle === 'string') {
      return { visitorId: parsed.visitorId, handle: parsed.handle, createdAt: parsed.createdAt ?? new Date().toISOString() }
    }
  } catch {
    // fall through to null
  }
  return null
}

function persist(identity: VisitorIdentity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
  } catch (err) {
    console.error('visitorStore: failed to persist to localStorage', err)
  }
}

const [state, setState] = createStore<{ identity: VisitorIdentity | null }>({ identity: loadStored() })

/** Reactive — VisitorTag.tsx renders off this directly. */
export const visitorState = state

/**
 * Synchronous accessor for call sites that need the identity immediately
 * (query params on a fetch/SSE URL) — falls back to a `'pending'` sentinel
 * if `initVisitor()` hasn't resolved the async hash yet (first paint).
 * Server-side validators (`isValidVisitorId`) reject `'pending'`, so an
 * event fired in that narrow window is simply left untracked rather than
 * mis-attributed.
 */
export function getVisitor(): VisitorIdentity {
  return state.identity ?? { visitorId: 'pending', handle: 'Anonymous Visitor', createdAt: new Date().toISOString() }
}

async function touch(): Promise<void> {
  const identity = state.identity
  if (!identity) return
  try {
    await fetch(`${window.location.origin}/api/visitor/touch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: identity.visitorId, handle: identity.handle }),
    })
  } catch (err) {
    console.error('visitorStore: heartbeat failed', err)
  }
}

export function setHandle(handle: string): void {
  const trimmed = handle.trim().slice(0, MAX_HANDLE_LENGTH)
  if (!trimmed || !state.identity) return
  const next = { ...state.identity, handle: trimmed }
  setState('identity', next)
  persist(next)
  void touch()
}

/**
 * Called once from EcosystemNav.tsx's onMount. Generates the persona/
 * visitorId on first visit (async — SHA-256 needs Web Crypto), fires an
 * immediate heartbeat, then a periodic one (paused while the tab is hidden)
 * so the Admin Drawer's "active duration" reflects real presence rather than
 * just first-load-to-last-action. Returns a synchronous cleanup — `onCleanup`
 * must be registered synchronously within `onMount`, so the interval id is
 * captured by reference in a closure rather than awaited into place.
 */
export function initVisitor(): () => void {
  let interval: ReturnType<typeof setInterval> | undefined

  void (async () => {
    if (!state.identity) {
      const token = crypto.randomUUID()
      const hash = await sha256Hex(navigator.userAgent + token)
      const identity: VisitorIdentity = { visitorId: hash.slice(0, 16), handle: randomPersona(), createdAt: new Date().toISOString() }
      persist(identity)
      setState('identity', identity)
    }
    void touch()
    interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') void touch()
    }, HEARTBEAT_MS)
  })()

  return () => {
    if (interval) clearInterval(interval)
  }
}
