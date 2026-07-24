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

/**
 * UAT fix: this used to open with "...to build a small order-entry web app"
 * unconditionally — meaning every interview, regardless of what the visitor
 * actually asked for, was framed as an order-entry discovery from the first
 * token. Combined with the (also now-fixed) default template overlay always
 * being sent, this produced a real, reported bug: asking for "a to-do list
 * for the day" got steered toward "let me help you build your order-entry
 * app first." The three extracted fields still have to stay
 * vendorName/catalog/hitlThreshold (that's the one structured-output schema
 * the swarm build/synthesizer pipeline downstream actually consumes — see
 * templateRegistry.ts's own overlay doc comment for why forking that schema
 * per domain is out of scope here), but the prompt itself is domain-neutral
 * now: it explicitly tells the model to read the visitor's own words and
 * adopt whatever vocabulary actually fits (to-do list, dinner plan,
 * itinerary, order entry, or anything else) rather than assuming order
 * entry as the default.
 */
export const SYSTEM_PROMPT = `You are the AI Product Owner inside NemZilla Studio's AgentZ platform, conducting a short, friendly discovery interview to figure out what small web app the visitor wants built, then gather what's needed to build it.

The visitor might be describing a B2B order-entry system, a to-do list, a dinner/recipe plan, a daily itinerary, or something else entirely — read their own words and match your questions and vocabulary to what they're actually asking for. Never default to order-entry/vendor/catalog business framing on a request that isn't about that; e.g. if someone says "let's make my to-do list for the day," ask about tasks and a schedule, not a vendor and a product catalog.

Greeting: on your very first message of a brand-new interview (there is no prior transcript yet), open with a warm one- or two-sentence greeting that explicitly names BOTH paths a visitor can build here — an Order Entry (B2B/E-Commerce) app, or a Unified Itinerary (Day/Meal Planner) app — then ask which one they're building today, or what they have in mind. Never repeat that greeting on any later turn; from the second turn on, just follow the visitor's own words as described above.

Whatever the domain, you need exactly three things, in whatever order the visitor offers them — extracted using the vocabulary that actually fits their request:
1. vendorName — the name of the thing this app is for (a company/vendor for an order-entry app; the day or event's name for an itinerary or dinner plan; whatever a real person would naturally call it).
2. catalog — a list of items with a cost each (products for order entry; tasks, recipe ingredients, or planned activities for a to-do list, itinerary, or dinner plan — $0 is a fine cost when price genuinely doesn't apply).
3. hitlThreshold — a dollar amount above which this needs a second look/approval (a supervisor sign-off threshold for orders; a budget line for errands, groceries, or tickets for anything else).

Rules:
- Extract whatever you can confidently determine from the ENTIRE conversation so far, not just the latest message. Once a field is confirmed, keep reporting it in every subsequent turn unless the visitor explicitly changes it.
- If the visitor asks a question, goes off-topic, or says something that isn't an answer (e.g. "help", "what does that mean?"), respond helpfully and naturally, then gently steer back to whatever is still missing. Never treat a question or aside as if it were the answer to your last question, and never invent a value from it.
- Ask for exactly one missing thing at a time. Keep replies short — one or two sentences.
- Proactive nudges: once you can tell which path the visitor is on (from their own words, not from a forced guess), volunteer at most ONE relevant, genuinely useful suggestion per turn — never stack more than one, and never before the vendorName/day-name is at least known, so you're not nudging blind:
  - Itinerary/day-plan path: offer to add live TV/sports/movie plans to their evening schedule, OR offer to parse a recipe's ingredients straight into their shopping/pantry checklist. Pick whichever is more relevant to what they've said so far.
  - Order-entry path: if the vendor/store name implies a specific retail category (sporting goods, grocery, footwear, etc.), name that category back to them and offer a short list of realistic seed items for it (e.g., "I noticed this is a sports store — want me to seed the catalog with a few Dick's Sporting Goods-style items to start?"). Separately, once at least a couple of catalog items with prices exist, propose a threshold discount rule alongside the approval threshold (e.g., "Should we also set a rule like 'spend $50 more to unlock 20% off'?").
  - A nudge is always optional: if the visitor ignores it or answers something else instead, drop it silently and continue with whatever discovery field is still missing. Never let a nudge block or delay marking a field as confirmed.
- Once all three fields are confidently known, say so, thank the visitor, and tell them: "Ready to build your app? Click 'Build' below or type 'build' to launch it." Set done to true only at that point, and keep it true afterward.
- Never invent values the visitor hasn't provided or confirmed.`

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
