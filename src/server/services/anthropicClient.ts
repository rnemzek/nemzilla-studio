/**
 * UOW-13: shared Anthropic client for the two real LLM call sites this UOW
 * introduces — the AI PO discovery interview (poInterviewLLM.ts) and the
 * domain micro-agent semantic classifier (domainAgents.ts). Constructed
 * lazily (not at module load) so importing either module doesn't throw in
 * an environment where ANTHROPIC_API_KEY isn't set yet.
 *
 * This is server-only code. The API key must never reach the browser —
 * src/lib/poInterview.ts (client) only ever calls our own
 * POST /api/po/interview endpoint, never the Anthropic SDK directly.
 */
import Anthropic, { APIConnectionError, AuthenticationError, RateLimitError, APIError } from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!client) client = new Anthropic()
  return client
}

/**
 * `new Anthropic()` does NOT throw when no key/credentials are found — it
 * silently defers, and only throws deep inside the SDK's request-signing
 * step the first time an actual API call is attempted ("Could not resolve
 * authentication method..."). That's a confusing place to first discover a
 * missing key in production, so callers check this explicitly first and
 * throw AnthropicNotConfiguredError (below) instead, before ever attempting
 * the network call.
 */
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0)
}

export class AnthropicNotConfiguredError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set in this environment')
    this.name = 'AnthropicNotConfiguredError'
  }
}

// Loud, unmissable, at server boot — not just on first failed request. Runs
// once, the moment this module is first imported (app.ts's route imports
// pull it in transitively at process start), so a misconfigured deployment
// shows the problem in the platform's boot/deploy logs immediately instead
// of only surfacing as a cryptic 502 the first time a user opens the CLI.
if (!isAnthropicConfigured()) {
  console.warn(
    '[anthropicClient] ANTHROPIC_API_KEY is not set. The AI PO discovery interview (/api/po/interview) and domain-agent semantic classification (domainAgents.ts) will fail until it is configured — add it to .env locally, or to your deployment platform\'s environment variables in production.',
  )
}

// Haiku 4.5 — the user's explicit choice for this UOW: both call sites are
// classification/extraction tasks (parse the PO interview, classify which
// domain agents are relevant), not open-ended reasoning, so the fastest/
// cheapest current model is the right fit rather than this skill's general
// default of Opus 4.8.
export const HAIKU_MODEL = 'claude-haiku-4-5'

export type LlmErrorCategory = 'not_configured' | 'authentication' | 'rate_limited' | 'connection' | 'api_error' | 'unknown'

export interface ClassifiedLlmError {
  category: LlmErrorCategory
  /** Human-readable, safe to log server-side. Never surfaced to the browser as-is. */
  logMessage: string
}

/**
 * Shared by both LLM call sites (poInterviewLLM.ts, domainAgents.ts) so a
 * misconfigured or failing Anthropic API produces the same clearly-labeled
 * diagnosis everywhere instead of two different guesses at the same
 * problem. Order matters: APIConnectionError is a subclass of APIError in
 * this SDK, so it must be checked first or it would always match the
 * generic APIError branch instead.
 */
export function classifyAnthropicError(err: unknown): ClassifiedLlmError {
  if (err instanceof AnthropicNotConfiguredError) {
    return { category: 'not_configured', logMessage: err.message }
  }
  if (err instanceof AuthenticationError) {
    return {
      category: 'authentication',
      logMessage: `Anthropic API rejected the configured key (401 authentication_error): ${err.message}. Check that ANTHROPIC_API_KEY is valid, not revoked, and not truncated/misquoted in the environment.`,
    }
  }
  if (err instanceof RateLimitError) {
    return { category: 'rate_limited', logMessage: `Anthropic API rate limit hit (429): ${err.message}` }
  }
  if (err instanceof APIConnectionError) {
    return {
      category: 'connection',
      logMessage: `Network error reaching the Anthropic API (timeout or connectivity, no HTTP response received): ${err.message}`,
    }
  }
  if (err instanceof APIError) {
    return {
      category: 'api_error',
      logMessage: `Anthropic API error (status ${err.status ?? 'unknown'}, type ${err.type ?? 'unknown'}): ${err.message}`,
    }
  }
  return { category: 'unknown', logMessage: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }
}
