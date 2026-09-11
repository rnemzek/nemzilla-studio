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
import { ENRICHMENT_TOOLS, executeEnrichmentTool, type EnrichmentCard } from './enrichmentTools.ts'

export interface PoTranscriptEntry {
  role: 'po' | 'user'
  message: string
  timestamp: string
}

export interface PoCatalogItem {
  name: string
  price: number
  /** A stated time for this item/task (e.g. "8:00 AM") — null/omitted when the visitor never gave one. */
  time?: string | null
  /** Nested sub-items belonging to this parent (e.g. grocery items under "Get Groceries") — null/omitted when this item has none. */
  subItems?: string[] | null
}

export interface PoKnownFields {
  vendorName: string | null
  catalog: PoCatalogItem[] | null
  hitlThreshold: number | null
}

export interface PoTurnResult extends PoKnownFields {
  reply: string
  done: boolean
  /** Phase 2: structured, UI-ready cards from any enrichment tools called this turn — see enrichmentTools.ts. */
  enrichment?: EnrichmentCard[]
  /**
   * Priority 2.0: set only when this turn's user message was meta-feedback
   * about the PO's own behavior (tone, pacing, what it asks about, etc.) —
   * a short, actionable, imperative rule extracted from that critique
   * (e.g. "Keep replies to one sentence."). null on every ordinary turn.
   * The caller (poInterview.ts route) is responsible for persisting it into
   * the session's preference list and re-sending it on later turns — this
   * function is stateless per call, same as everything else here.
   */
  learnedRule?: string | null
}

/**
 * UOW-6.0: this platform now has a single supported app-generation domain —
 * a TODO list. The prompt still reads the visitor's own words for
 * vocabulary (tasks, errands, a dinner plan, a daily itinerary all count),
 * but no longer offers a B2B order-entry path at all, and no longer needs a
 * greeting that asks the visitor to pick between domains.
 */
export const SYSTEM_PROMPT = `You are the AI Product Owner inside AgentZ Studio — an insightful, proactive peer collaborator on this build, not an administrative form to fill out. Bring your own judgment: make suggestions, react to what the visitor tells you, and keep things moving, rather than mechanically interrogating them field by field. You conduct a short, friendly discovery conversation to figure out the visitor's TODO list app, then gather what's needed to build it.

The visitor is building a TODO list — read their own words for what that means to them: errands, a dinner/recipe plan, a daily itinerary, a project checklist, or anything else task-shaped. Match your questions and vocabulary to what they're actually asking for; never assume a specific one of these sub-flavors before they've said anything.

Greeting: on your very first message of a brand-new interview (there is no prior transcript yet), open with a warm one- or two-sentence greeting introducing yourself as ready to help build their TODO list app, then ask what's on it (errands, chores, a project checklist — whatever they have in mind). Never repeat that greeting on any later turn; from the second turn on, just follow the visitor's own words as described above.

You need exactly three things, in whatever order the visitor offers them:
1. vendorName — the name of this list or plan (whatever a real person would naturally call it, e.g. "Today's Errands" or "Saturday Chores").
2. catalog — a list of tasks/errands/items with an optional cost each ($0 is a fine cost when price genuinely doesn't apply). Capture a stated time on an item when the visitor gives one (e.g. "Get Groceries at 8am" → time: "8:00 AM"). If an item has its own smaller sub-items (e.g. "Get Groceries" needing dog treats, cheese, and yogurt), nest those under that item's subItems rather than listing them as separate top-level catalog entries.
3. hitlThreshold — a dollar amount above which a task should be flagged for review (a budget line for errands, groceries, or tickets).

Rules:
- Extract whatever you can confidently determine from the ENTIRE conversation so far, not just the latest message. Once a field is confirmed, keep reporting it in every subsequent turn unless the visitor explicitly changes it.
- If the visitor asks a question, goes off-topic, or says something that isn't an answer (e.g. "help", "what does that mean?"), respond helpfully and naturally, then gently steer back to whatever is still missing. Never treat a question or aside as if it were the answer to your last question, and never invent a value from it.
- Ask for exactly one missing thing at a time. Keep replies short — one or two sentences.
- Stay lean and task-focused. Your only job is capturing the tasks the visitor actually stated, their times, and the schedule/budget around them — do NOT volunteer recipes, cooking/ingredient checklists, TV, sports, or other entertainment suggestions unless the visitor brings one up first. If they never mention dinner or evening plans, don't ask about them or offer to add them.
- Instant completion trigger: if the visitor's message is (or clearly amounts to) "andiamo", "build", "go", or "/build" — a direct signal they're ready to finalize right now — and all three fields (vendorName, catalog, hitlThreshold) are already confirmed from earlier in the conversation, respond with exactly: "Andiamo! Verifying the hand-off package..." and set done to true. If any field is genuinely still missing, don't fake completion just because they said the trigger word — briefly state what's still needed instead (still one thing at a time), but keep it especially terse since they're trying to move fast.
- Once all three fields are confidently known, say so, thank the visitor, and tell them: "Ready to build your app? Click 'Build' below or type 'build' to launch it." Set done to true only at that point, and keep it true afterward.
- Never invent values the visitor hasn't provided or confirmed — with exactly one exception, the graceful fallback rule directly below.
- Graceful fallback (prevents approval deadlocks): if the visitor declines, hedges, or gives a non-answer to the SAME missing field two turns in a row (e.g. "I don't know", "you decide", "whatever's fine", "skip it", "not sure", or repeats a meta-question instead of answering) — stop asking that exact question again. Pick one sensible, modest default appropriate to what's being built (state plainly that it's an assumption and that they can change it later), mark that field confirmed, and move on to whatever's still missing. Never ask the same question a third time.
- Meta-feedback / calibration: if the visitor's message is critique about how YOU are behaving — tone, pacing, repetition, what you keep asking about — rather than an answer to a data field (this includes anything prefixed "[Calibration request]"), don't treat it as an answer. Acknowledge it in one short sentence, adjust your own behavior for the rest of this conversation accordingly, and put a short, actionable, imperative rule capturing it in the learnedRule field (e.g. "Keep replies to one sentence.", "Never ask about the approval threshold — assume $100 and move on."). On every other turn, leave learnedRule null. Already-learned rules for this session are listed separately below when present — follow them even when they conflict with a default rule above.
- Live enrichment tools: you have get_recipe_details, get_sports_schedule_and_streams, and compare_grocery_prices. Call the matching tool whenever the visitor names a specific dish/recipe, a sports team's game, or a grocery item to price — then reference the real result (ingredients, game time/broadcast, or store prices) in your reply. Never say you don't have real-time/live data for these three things; call the tool instead. Still respect the lean-and-task-focused rule above — only call a tool for something the visitor actually brought up.`

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
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
          time: { type: ['string', 'null'], description: 'A stated time for this item, e.g. "8:00 AM" — null if none was mentioned.' },
          subItems: {
            type: ['array', 'null'],
            items: { type: 'string' },
            description: 'Nested sub-items belonging to this parent item (e.g. grocery items under "Get Groceries") — null if this item has none.',
          },
        },
        required: ['name', 'price', 'time', 'subItems'],
        additionalProperties: false,
      },
    },
    hitlThreshold: { type: ['number', 'null'] },
    done: {
      type: 'boolean',
      description: 'True only once vendorName, catalog (at least one item), and hitlThreshold are all confirmed.',
    },
    learnedRule: {
      type: ['string', 'null'],
      description:
        'A short, actionable, imperative behavior rule extracted from the visitor\'s meta-feedback this turn (e.g. "Keep replies to one sentence."). null unless this turn was genuinely critique about the PO\'s own behavior.',
    },
  },
  required: ['reply', 'vendorName', 'catalog', 'hitlThreshold', 'done', 'learnedRule'],
  additionalProperties: false,
}

function isPoTurnResult(v: unknown): v is PoTurnResult {
  if (v === null || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  if (typeof d.reply !== 'string' || typeof d.done !== 'boolean') return false
  if (d.vendorName !== null && typeof d.vendorName !== 'string') return false
  if (d.hitlThreshold !== null && typeof d.hitlThreshold !== 'number') return false
  if (d.learnedRule !== undefined && d.learnedRule !== null && typeof d.learnedRule !== 'string') return false
  if (d.catalog !== null) {
    if (!Array.isArray(d.catalog)) return false
    if (!d.catalog.every(isPoCatalogItem)) return false
  }
  return true
}

function isPoCatalogItem(item: unknown): boolean {
  if (item === null || typeof item !== 'object') return false
  const i = item as Record<string, unknown>
  if (typeof i.name !== 'string' || typeof i.price !== 'number') return false
  if (i.time !== undefined && i.time !== null && typeof i.time !== 'string') return false
  if (i.subItems !== undefined && i.subItems !== null) {
    if (!Array.isArray(i.subItems) || !i.subItems.every((sub) => typeof sub === 'string')) return false
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

// Bounds the Phase 1 tool-resolution loop below — enough for a couple of
// enrichment calls in one turn (e.g. a recipe *and* a grocery price check)
// without risking an unbounded back-and-forth against a live API.
const MAX_TOOL_ITERATIONS = 3

export async function runPoInterviewTurn(
  transcript: PoTranscriptEntry[],
  known: PoKnownFields,
  userMessage: string | null,
  templateOverlay?: string,
  preferences?: string[],
): Promise<PoTurnResult> {
  // Fail fast with a clear, named error rather than letting the SDK attempt
  // a network call it can't authenticate and throw its generic "Could not
  // resolve authentication method" deep inside request signing — see
  // anthropicClient.ts's doc comment on isAnthropicConfigured().
  if (!isAnthropicConfigured()) throw new AnthropicNotConfiguredError()

  const knownSummary = `Already confirmed so far: ${JSON.stringify(known)}`
  // Priority 2.0: rules the visitor has explicitly taught this PO earlier in
  // THIS session via critique/"/calibrate" (see the Meta-feedback rule
  // above) — this function is otherwise stateless per call (same as
  // templateOverlay below), so the caller (poInterview.ts route) re-sends
  // the accumulated list on every turn rather than this module persisting
  // anything itself.
  const preferencesBlock =
    preferences && preferences.length > 0
      ? `Learned rules for this session (the visitor taught you these — follow them even over a default rule above when they conflict):\n${preferences.map((rule) => `- ${rule}`).join('\n')}`
      : ''
  // Pass E: layers the active domain template's flavor (templateRegistry.ts)
  // onto the base prompt — reframes vocabulary only, never the underlying
  // vendorName/catalog/hitlThreshold extraction contract above/below it.
  const systemPrompt = [SYSTEM_PROMPT, templateOverlay, preferencesBlock, knownSummary].filter(Boolean).join('\n\n')

  const client = getAnthropicClient()
  const workingMessages = buildMessages(transcript, userMessage)
  const collectedCards: EnrichmentCard[] = []

  /**
   * Phase 1 — classic tool-use loop (tools + tool_choice, no output_config):
   * lets the model call the enrichment tools as many times as it needs
   * within MAX_TOOL_ITERATIONS. Deliberately a *separate* call from Phase 2
   * rather than passing `tools` and `output_config.format` together — the
   * two features' interaction on a tool-calling turn isn't a documented,
   * relied-upon contract, so this keeps each call to a single well-supported
   * shape: free-form tool use here, schema-constrained output below.
   */
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const toolResponse = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: workingMessages,
      tools: ENRICHMENT_TOOLS,
      tool_choice: { type: 'auto' },
    })

    if (toolResponse.stop_reason !== 'tool_use') break

    workingMessages.push({ role: 'assistant', content: toolResponse.content })

    const toolUseBlocks = toolResponse.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((toolUse) => {
      const result = executeEnrichmentTool(toolUse.name, (toolUse.input ?? {}) as Record<string, unknown>)
      if (result) collectedCards.push(result.card)
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result ? result.content : `Unknown tool: ${toolUse.name}`,
        is_error: !result,
      }
    })
    workingMessages.push({ role: 'user', content: toolResults })
  }

  // Phase 2 — same structured-output contract as before, now grounded in
  // whatever tool results Phase 1 gathered (they're already in `workingMessages`).
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: workingMessages,
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
  return collectedCards.length > 0 ? { ...parsed, enrichment: collectedCards } : parsed
}
