/**
 * UOW-13: thin client for the real LLM-backed AI PO Discovery Interviewer.
 * The FSM this replaced (UOW-11 Task 11.3) lived entirely in the browser;
 * this module intentionally does almost nothing on its own — every turn is
 * a POST to /api/po/interview, which is the ONLY place the Anthropic SDK
 * runs (src/server/services/poInterviewLLM.ts). The API key must never
 * reach client code, so there is no local parsing/extraction logic here
 * anymore, just state bookkeeping and the network call.
 */

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
  transcript: PoTranscriptEntry[]
  vendorName: string | null
  catalog: PoCatalogItem[] | null
  hitlThreshold: number | null
  done: boolean
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

interface PoInterviewApiResponse {
  reply: string
  vendorName: string | null
  catalog: PoCatalogItem[] | null
  hitlThreshold: number | null
  done: boolean
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * `userMessage: null` requests the PO's opening line (no prior user turn
 * exists yet) — used by createPoInterview()/startPoInterview(). Failures
 * degrade to an in-character message rather than surfacing a raw HTTP error
 * in the terminal.
 */
async function callInterviewApi(
  transcript: PoTranscriptEntry[],
  known: { vendorName: string | null; catalog: PoCatalogItem[] | null; hitlThreshold: number | null },
  userMessage: string | null,
): Promise<PoInterviewApiResponse> {
  try {
    const res = await fetch(`${window.location.origin}/api/po/interview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, known, userMessage }),
    })
    if (!res.ok) {
      // The server tags each failure category distinctly (e.g. "llm_not_configured"
      // vs "llm_rate_limited") — surface it here so the browser console shows
      // the same diagnosis the server already logged, not just a bare status.
      const body = await res.json().catch(() => null)
      throw new Error(`HTTP ${res.status}${body?.error ? ` (${body.error})` : ''}`)
    }
    return (await res.json()) as PoInterviewApiResponse
  } catch (err) {
    console.error('poInterview: /api/po/interview call failed', err)
    return {
      reply: "Sorry, I'm having trouble reaching the discovery service right now — try again in a moment.",
      ...known,
      done: false,
    }
  }
}

function applyTurn(state: PoInterviewState, data: PoInterviewApiResponse, userMessage: string | null): PoInterviewStep {
  if (userMessage !== null) state.transcript.push({ role: 'user', message: userMessage, timestamp: nowIso() })
  state.transcript.push({ role: 'po', message: data.reply, timestamp: nowIso() })
  state.vendorName = data.vendorName
  state.catalog = data.catalog
  state.hitlThreshold = data.hitlThreshold
  state.done = data.done
  return { state, reply: data.reply, done: data.done }
}

function createPoInterview(): PoInterviewState {
  return {
    sessionId: crypto.randomUUID(),
    transcript: [],
    vendorName: null,
    catalog: null,
    hitlThreshold: null,
    done: false,
  }
}

/**
 * Starts a fresh interview. `openingMessage`, when provided, is the user's
 * own first line (from the CLI's multi-word fallback — see
 * terminalCommands.ts) and is recorded as a real transcript turn; when
 * omitted, the PO speaks first and nothing is recorded as having been said
 * by the user yet.
 */
export async function startPoInterview(openingMessage?: string): Promise<PoInterviewStep> {
  const state = createPoInterview()
  const known = { vendorName: null, catalog: null, hitlThreshold: null }
  const data = await callInterviewApi(state.transcript, known, openingMessage ?? null)
  return applyTurn(state, data, openingMessage ?? null)
}

/** Advances the interview by one user answer. */
export async function submitPoAnswer(state: PoInterviewState, userMessage: string): Promise<PoInterviewStep> {
  const known = { vendorName: state.vendorName, catalog: state.catalog, hitlThreshold: state.hitlThreshold }
  const data = await callInterviewApi(state.transcript, known, userMessage)
  return applyTurn(state, data, userMessage)
}
