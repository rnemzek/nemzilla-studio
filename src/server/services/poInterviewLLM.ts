/**
 * UOW-13: the real LLM-backed AI PO discovery interviewer, replacing the
 * deterministic finite-state machine from UOW-11's poInterview.ts. Runs
 * server-side only (see anthropicClient.ts). Every turn is a single
 * structured-output call to Claude Haiku 4.5: the model reads the full
 * transcript plus whatever fields are already confirmed, extracts anything
 * new it can determine, and produces its next conversational line — so
 * off-topic questions, "help"-shaped answers, or out-of-order information
 * are handled by genuine language understanding instead of a rigid
 * stage-by-stage script.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { AnthropicNotConfiguredError, getAnthropicClient, isAnthropicConfigured, HAIKU_MODEL } from './anthropicClient.ts'

export interface PoTranscriptEntry {
  role: 'po' | 'user'
  message: string
  timestamp: string
}

export interface PoCatalogItem {
  name: string
  price: number
}

export interface PoKnownFields {
  vendorName: string | null
  catalog: PoCatalogItem[] | null
  hitlThreshold: number | null
}

export interface PoTurnResult extends PoKnownFields {
  reply: string
  done: boolean
}

export const SYSTEM_PROMPT = `You are the AI Product Owner inside NemZilla Studio's AgentZ platform, conducting a short, friendly discovery interview to gather what's needed to build a small order-entry web app. You need exactly three things, in whatever order the user offers them:

1. vendorName — the name of the vendor/company the app is for.
2. catalog — a list of products, each with a name and a price in US dollars.
3. hitlThreshold — a dollar amount above which an order requires supervisor sign-off (human-in-the-loop approval).

Rules:
- Extract whatever you can confidently determine from the ENTIRE conversation so far, not just the latest message. Once a field is confirmed, keep reporting it in every subsequent turn unless the user explicitly changes it.
- If the user asks a question, goes off-topic, or says something that isn't an answer (e.g. "help", "what does that mean?"), respond helpfully and naturally, then gently steer back to whatever is still missing. Never treat a question or aside as if it were the answer to your last question, and never invent a value from it.
- Ask for exactly one missing thing at a time. Keep replies short — one or two sentences.
- Once all three fields are confidently known, say so, thank the user, and tell them: "Ready to build your app? Click 'Build' below or type 'build' to launch it." Set done to true only at that point, and keep it true afterward.
- Never invent values the user hasn't provided or confirmed.`

// Deliberately not using client.messages.parse() here: that helper's
// documented path assumes a Zod-derived output_config.format, and this
// schema is hand-written JSON Schema. messages.create() + output_config is
// the same structured-outputs feature at the wire level, just parsed by
// hand below — a smaller surface to trust without SDK-behavior guessing.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: "The PO's next conversational message to the user." },
    vendorName: { type: ['string', 'null'] },
    catalog: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, price: { type: 'number' } },
        required: ['name', 'price'],
        additionalProperties: false,
      },
    },
    hitlThreshold: { type: ['number', 'null'] },
    done: {
      type: 'boolean',
      description: 'True only once vendorName, catalog (at least one item), and hitlThreshold are all confirmed.',
    },
  },
  required: ['reply', 'vendorName', 'catalog', 'hitlThreshold', 'done'],
  additionalProperties: false,
}

function isPoTurnResult(v: unknown): v is PoTurnResult {
  if (v === null || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  if (typeof d.reply !== 'string' || typeof d.done !== 'boolean') return false
  if (d.vendorName !== null && typeof d.vendorName !== 'string') return false
  if (d.hitlThreshold !== null && typeof d.hitlThreshold !== 'number') return false
  if (d.catalog !== null) {
    if (!Array.isArray(d.catalog)) return false
    if (
      !d.catalog.every(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).name === 'string' &&
          typeof (item as Record<string, unknown>).price === 'number',
      )
    )
      return false
  }
  return true
}

function buildMessages(transcript: PoTranscriptEntry[], userMessage: string | null): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = transcript.map((entry) => ({
    role: entry.role === 'po' ? 'assistant' : 'user',
    content: entry.message,
  }))
  // Kickoff (userMessage === null): the API requires a non-empty first user
  // turn, but this sentinel is never shown to the user or persisted in the
  // transcript — see poInterview.ts route handler.
  messages.push({ role: 'user', content: userMessage ?? "Let's begin the discovery interview." })
  return messages
}

const FALLBACK_REPLY = "Sorry, I didn't quite catch that — could you rephrase?"

export async function runPoInterviewTurn(
  transcript: PoTranscriptEntry[],
  known: PoKnownFields,
  userMessage: string | null,
  templateOverlay?: string,
): Promise<PoTurnResult> {
  // Fail fast with a clear, named error rather than letting the SDK attempt
  // a network call it can't authenticate and throw its generic "Could not
  // resolve authentication method" deep inside request signing — see
  // anthropicClient.ts's doc comment on isAnthropicConfigured().
  if (!isAnthropicConfigured()) throw new AnthropicNotConfiguredError()

  const knownSummary = `Already confirmed so far: ${JSON.stringify(known)}`
  // Pass E: layers the active domain template's flavor (templateRegistry.ts)
  // onto the base prompt — reframes vocabulary only, never the underlying
  // vendorName/catalog/hitlThreshold extraction contract above/below it.
  const systemPrompt = templateOverlay ? `${SYSTEM_PROMPT}\n\n${templateOverlay}\n\n${knownSummary}` : `${SYSTEM_PROMPT}\n\n${knownSummary}`

  const response = await getAnthropicClient().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: buildMessages(transcript, userMessage),
    output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
  })

  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  if (!block) return { reply: FALLBACK_REPLY, ...known, done: false }

  let parsed: unknown
  try {
    parsed = JSON.parse(block.text)
  } catch {
    return { reply: FALLBACK_REPLY, ...known, done: false }
  }

  if (!isPoTurnResult(parsed)) return { reply: FALLBACK_REPLY, ...known, done: false }
  return parsed
}
