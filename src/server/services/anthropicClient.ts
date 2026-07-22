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
import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!client) client = new Anthropic()
  return client
}

// Haiku 4.5 — the user's explicit choice for this UOW: both call sites are
// classification/extraction tasks (parse the PO interview, classify which
// domain agents are relevant), not open-ended reasoning, so the fastest/
// cheapest current model is the right fit rather than this skill's general
// default of Opus 4.8.
export const HAIKU_MODEL = 'claude-haiku-4-5'
