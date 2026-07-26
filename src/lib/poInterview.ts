/**
 * UOW-13: thin client for the real LLM-backed AI PO Discovery Interviewer.
 * The FSM this replaced (UOW-11 Task 11.3) lived entirely in the browser;
 * this module intentionally does almost nothing on its own — every turn is
 * a POST to /api/po/interview, which is the ONLY place the Anthropic SDK
 * runs (src/server/services/poInterviewLLM.ts). The API key must never
 * reach client code, so there is no local parsing/extraction logic here
 * anymore, just state bookkeeping and the network call.
 */

import { getVisitor } from './visitorStore.ts'
import { activeTemplateId, templateExplicitlySet } from './templateStore.ts'

export interface PoTranscriptEntry {
  role: 'po' | 'user'
  message: string
  timestamp: string
}

/**
 * Mirrors the server's EnrichmentCard union (poInterviewLLM.ts /
 * enrichmentTools.ts) — not imported directly, since server services live in
 * a separate tsconfig project (tsconfig.node.json) than this client code
 * (tsconfig.app.json). Same pattern as SYSTEM_ORDER_CEILING below.
 */
export type EnrichmentCard =
  | {
      type: 'recipe'
      title: string
      servings: number
      prepTimeMinutes: number
      ingredients: Array<{ name: string; quantity: string }>
      steps: string[]
    }
  | {
      type: 'sports'
      team: string
      games: Array<{ opponent: string; date: string; time: string; venue: string; broadcast: string; streamUrl: string }>
    }
  | {
      type: 'grocery'
      item: string
      stores: Array<{ name: string; price: number }>
      cheapest: string
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
  /**
   * Priority 2.0: behavior rules the visitor has taught this PO via
   * critique or "/calibrate" earlier in this session (see poInterviewLLM.ts's
   * Meta-feedback rule) — re-sent on every subsequent turn so the server can
   * inject them into the system prompt. This module (and the server route)
   * is otherwise stateless per call; the browser tab is the only thing that
   * persists this, same as the rest of PoInterviewState.
   */
  preferences: string[]
}

export interface PoInterviewStep {
  state: PoInterviewState
  reply: string
  done: boolean
  enrichment?: EnrichmentCard[]
  /** Set only on the turn that just extracted it — see PoInterviewState.preferences for where it lives afterward. */
  learnedRule?: string | null
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
  enrichment?: EnrichmentCard[]
  learnedRule?: string | null
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
  sessionId: string,
  preferences: string[],
): Promise<PoInterviewApiResponse> {
  try {
    // Pass C: correlates this interview to a visitor (visitorStore.ts) and
    // lets the server audit-log the turn under this interview's own
    // sessionId — powers the Admin Drawer's Session Detail view.
    // Pass E: sends the active domain template id (templateStore.ts) so the
    // server can layer that domain's systemPromptOverlay onto the base
    // discovery prompt for this turn (poInterviewLLM.ts) — but only once
    // the visitor has explicitly run /template. Sending it unconditionally
    // (the original Pass E behavior) meant every interview silently got the
    // default 'order-entry' template's overlay whether the visitor asked
    // for an order-entry app or not, overriding the AI PO's own
    // natural-language domain judgment for anyone who never touched
    // /template — a real bug, not the intended behavior.
    const visitor = getVisitor()
    const res = await fetch(`${window.location.origin}/api/po/interview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        known,
        userMessage,
        sessionId,
        visitorId: visitor.visitorId,
        handle: visitor.handle,
        templateId: templateExplicitlySet() ? activeTemplateId() : undefined,
        preferences,
      }),
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
  // UAT fix: the system prompt tells the model to keep re-reporting an
  // already-confirmed field on every later turn, but that's a natural-
  // language instruction to an LLM, not a guarantee — if the model ever
  // omits one on the exact turn `done` flips true, overwriting unconditionally
  // here silently erased already-confirmed data, which made
  // persistInterviewArtifacts() (terminalCommands.ts) skip writing that
  // artifact and the swarm hand-off report "denied — no completed discovery
  // interview found" even though the visitor really had finished. A field,
  // once genuinely confirmed, should never regress back to null client-side.
  state.vendorName = data.vendorName ?? state.vendorName
  state.catalog = data.catalog ?? state.catalog
  state.hitlThreshold = data.hitlThreshold ?? state.hitlThreshold
  state.done = data.done
  if (data.learnedRule && !state.preferences.includes(data.learnedRule)) {
    state.preferences = [...state.preferences, data.learnedRule]
  }
  return { state, reply: data.reply, done: data.done, enrichment: data.enrichment, learnedRule: data.learnedRule }
}

function createPoInterview(): PoInterviewState {
  return {
    sessionId: crypto.randomUUID(),
    transcript: [],
    vendorName: null,
    catalog: null,
    hitlThreshold: null,
    done: false,
    preferences: [],
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
  const data = await callInterviewApi(state.transcript, known, openingMessage ?? null, state.sessionId, state.preferences)
  return applyTurn(state, data, openingMessage ?? null)
}

/** Advances the interview by one user answer. */
export async function submitPoAnswer(state: PoInterviewState, userMessage: string): Promise<PoInterviewStep> {
  const known = { vendorName: state.vendorName, catalog: state.catalog, hitlThreshold: state.hitlThreshold }
  const data = await callInterviewApi(state.transcript, known, userMessage, state.sessionId, state.preferences)
  return applyTurn(state, data, userMessage)
}
