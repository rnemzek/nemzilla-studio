/**
 * UOW-11 Task 11.3: the conversational AI PO Discovery Interviewer, driven
 * as a deterministic finite-state machine — consistent with this project's
 * existing pattern (appGeneratorPrompt.ts's matchScenario/generateAppSnippet)
 * of simulating "AI" behavior with real, inspectable logic rather than a
 * live model call. Advances one user answer at a time; invalid input re-asks
 * the same stage instead of crashing or silently advancing.
 */

export type PoInterviewStage = 'vendor_name' | 'catalog' | 'policy_threshold' | 'complete'

export interface PoTranscriptEntry {
  role: 'po' | 'user'
  message: string
  timestamp: string
}

export interface PoCatalogItem {
  name: string
  price: number
}

export interface PoInterviewState {
  sessionId: string
  stage: PoInterviewStage
  vendorName: string | null
  catalog: PoCatalogItem[] | null
  hitlThreshold: number | null
  transcript: PoTranscriptEntry[]
}

export interface PoInterviewStep {
  state: PoInterviewState
  reply: string
  done: boolean
}

// Mirrors policyEngine.ts's SYSTEM_CEILING.maxOrderThreshold (see
// AGENTZ-STUDIO-SDK.md section 6A) — not imported directly, since
// policyEngine.ts lives in the server-only tsconfig project. This is public
// governance policy, already surfaced in every generated ACME snippet's own
// UI copy, not a secret.
export const SYSTEM_ORDER_CEILING = 500

const PROMPTS = {
  vendor_name: 'What is the name of your vendor/company?',
  catalog: 'What products and prices do you want in the catalog? (format: Name|$Price, Name|$Price, ...)',
  policy_threshold: 'What policy ceiling should require supervisor sign-off? (e.g. "$100")',
} as const

function nowIso(): string {
  return new Date().toISOString()
}

function say(state: PoInterviewState, message: string): void {
  state.transcript.push({ role: 'po', message, timestamp: nowIso() })
}

function hear(state: PoInterviewState, message: string): void {
  state.transcript.push({ role: 'user', message, timestamp: nowIso() })
}

export function createPoInterview(): PoInterviewState {
  const state: PoInterviewState = {
    sessionId: crypto.randomUUID(),
    stage: 'vendor_name',
    vendorName: null,
    catalog: null,
    hitlThreshold: null,
    transcript: [],
  }
  say(state, "Let's build your order entry application together.")
  say(state, PROMPTS.vendor_name)
  return state
}

function parseCatalog(raw: string): PoCatalogItem[] | null {
  const items: PoCatalogItem[] = []
  for (const part of raw.split(',')) {
    const [namePart, pricePart] = part.split('|')
    if (!namePart || !pricePart) return null
    const name = namePart.trim()
    const price = Number(pricePart.replace(/[^0-9.]/g, ''))
    if (!name || !Number.isFinite(price) || price <= 0) return null
    items.push({ name, price })
  }
  return items.length > 0 ? items : null
}

function parseThreshold(raw: string): number | null {
  const match = raw.match(/\$?\s*(\d+(?:\.\d+)?)/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Advances the interview by one user answer, mutating and returning `state`. */
export function submitPoAnswer(state: PoInterviewState, userMessage: string): PoInterviewStep {
  hear(state, userMessage)

  switch (state.stage) {
    case 'vendor_name': {
      const name = userMessage.trim()
      if (!name) {
        const reply = "I didn't catch a name — what should I call your vendor/company?"
        say(state, reply)
        return { state, reply, done: false }
      }
      state.vendorName = name
      state.stage = 'catalog'
      const reply = `Great, "${name}" it is. ${PROMPTS.catalog}`
      say(state, reply)
      return { state, reply, done: false }
    }
    case 'catalog': {
      const items = parseCatalog(userMessage)
      if (!items) {
        const reply = 'I couldn\'t parse that catalog — try the format "Name|$Price, Name|$Price" (e.g. "Mouse Pad|$5, Mouse|$15").'
        say(state, reply)
        return { state, reply, done: false }
      }
      state.catalog = items
      state.stage = 'policy_threshold'
      const reply = `Got it — ${items.length} item(s) catalogued. ${PROMPTS.policy_threshold}`
      say(state, reply)
      return { state, reply, done: false }
    }
    case 'policy_threshold': {
      const threshold = parseThreshold(userMessage)
      if (threshold === null) {
        const reply = 'I need a dollar amount for the supervisor sign-off ceiling — e.g. "$100".'
        say(state, reply)
        return { state, reply, done: false }
      }
      state.hitlThreshold = threshold
      state.stage = 'complete'
      const reply = `We're all set! Default policies applied ($${threshold} HITL threshold). Type "Andiamo" to launch.`
      say(state, reply)
      return { state, reply, done: true }
    }
    case 'complete': {
      const reply = 'Interview already complete — type "Andiamo" to launch, or "build" to start a new one.'
      say(state, reply)
      return { state, reply, done: true }
    }
  }
}
