/**
 * UOW-11 Task 11.5 / UOW-13: the pluggable domain micro-agent registry. Each
 * entry is a self-contained { agent, alwaysOn, description, run } tuple —
 * adding a new domain agent means adding one more registry entry, never
 * touching the dispatcher. `AI Vendor`/`AI OE` are unconditional (every PO
 * interview is fundamentally an order-entry app). Everything else used to be
 * decided by hardcoded substring keyword matching; UOW-13 replaces that with
 * a single real semantic-classification call to Claude Haiku 4.5
 * (classifyRelevantAgents below) — the model judges relevance from context
 * and intent (e.g. a stadium concession stand implies sports relevance even
 * without the literal word "sport"), not string containment.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { classifyAnthropicError, getAnthropicClient, HAIKU_MODEL } from './anthropicClient.ts'

export interface DomainAgentContext {
  vendorName: string
  catalogItemNames: string[]
}

export interface DomainAgentResult {
  agent: string
  /** Reasoning text streamed token-by-token on the Swarm Canvas for this agent's stage. */
  summary: string
  /** Structured sub-schema/AST fragment this agent contributes — feeds into the Policy and Lead Dev stages. */
  schema: unknown
}

interface DomainAgentDefinition {
  agent: string
  /** AI Vendor/AI OE are true unconditionally — see module doc comment. Conditional agents are decided by classifyRelevantAgents(), not a per-agent predicate. */
  alwaysOn: boolean
  /** Shown to the classifier model — what this agent's specialty covers. */
  description: string
  run: (ctx: DomainAgentContext) => DomainAgentResult
}

const REGISTRY: DomainAgentDefinition[] = [
  {
    agent: 'AI Vendor',
    alwaysOn: true,
    description: 'Product catalog and inventory schemas.',
    run: (ctx) => ({
      agent: 'AI Vendor',
      summary: `Modeled the product catalog schema for ${ctx.vendorName} (${ctx.catalogItemNames.length} item(s)).`,
      schema: { type: 'catalog', vendorName: ctx.vendorName, items: ctx.catalogItemNames },
    }),
  },
  {
    agent: 'AI OE',
    alwaysOn: true,
    description: 'Order entry, cart math, and checkout flows.',
    run: (ctx) => ({
      agent: 'AI OE',
      summary: `Modeled cart math and checkout flow for ${ctx.vendorName}'s order entry app.`,
      schema: {
        type: 'orderEntry',
        cartFields: ['productId', 'quantity', 'lineTotal'],
        checkoutSteps: ['review', 'submit', 'confirmation'],
      },
    }),
  },
  {
    agent: 'AI TODO',
    alwaysOn: false,
    description: 'Task management and checklist widgets, for vendors whose app involves tracking to-dos or errands.',
    run: (ctx) => ({
      agent: 'AI TODO',
      summary: `Modeled a task/checklist widget alongside ${ctx.vendorName}'s catalog.`,
      schema: { type: 'todoList', tasks: [] },
    }),
  },
  {
    agent: 'AI Sport',
    alwaysOn: false,
    description: 'Live sports schedules and scores (ESPN-style), for vendors connected to sporting events, teams, or venues.',
    run: (ctx) => ({
      agent: 'AI Sport',
      summary: `Modeled a live sports schedule/score widget (ESPN-style) for ${ctx.vendorName}.`,
      schema: { type: 'sportsWidget', source: 'ESPN', teams: [] },
    }),
  },
  {
    agent: 'AI SS',
    alwaysOn: false,
    description: 'Streaming/movie watchlists (TMDB-style), for vendors connected to film, TV, or video entertainment.',
    run: (ctx) => ({
      agent: 'AI SS',
      summary: `Modeled a streaming/watchlist widget (TMDB-style) for ${ctx.vendorName}.`,
      schema: { type: 'streamingWidget', source: 'TMDB', titles: [] },
    }),
  },
  {
    agent: 'AI Food',
    alwaysOn: false,
    description: 'Recipes and meal planning (TheMealDB-style), for vendors connected to food, dining, or cooking.',
    run: (ctx) => ({
      agent: 'AI Food',
      summary: `Modeled a recipe/meal-planning widget (TheMealDB-style) for ${ctx.vendorName}.`,
      schema: { type: 'mealPlanner', source: 'TheMealDB', recipes: [] },
    }),
  },
]

export const DOMAIN_AGENT_IDS: string[] = REGISTRY.map((def) => def.agent)

/**
 * A leading free-text `reasoning` field (emitted before the boolean
 * verdicts, since structured-output models generate object fields in
 * schema order) plus one explicit boolean per candidate — not a
 * variable-length array constrained by `enum`. Verified empirically against
 * Haiku 4.5: the array+enum shape produced arbitrary-looking picks (missed
 * unambiguous sports merchandise, invented an irrelevant streaming-agent
 * pick for a ballpark concession stand); giving the model a scratch-space
 * sentence per decision before it has to commit to true/false, and forcing
 * one explicit yes/no per agent instead of composing a list, fixed it.
 */
function classifierSchema(candidateIds: string[]) {
  const properties: Record<string, unknown> = {
    reasoning: {
      type: 'string',
      description:
        "One brief sentence naming the vendor's actual business, then noting which (if any) of the candidate specialties have a genuine direct connection to it.",
    },
  }
  for (const id of candidateIds) {
    properties[id] = { type: 'boolean', description: `True only if ${id} is genuinely relevant to this specific vendor/catalog.` }
  }
  return {
    type: 'object',
    properties,
    required: ['reasoning', ...candidateIds],
    additionalProperties: false,
  }
}

/**
 * Real semantic classification, not keyword matching: asks Claude Haiku 4.5
 * which of the optional domain agents are relevant to this vendor/catalog.
 * Fails safe — any error or malformed response dispatches zero optional
 * agents (only the always-on pair runs), rather than guessing or throwing
 * and breaking the swarm pipeline over a classification hiccup.
 */
async function classifyRelevantAgents(ctx: DomainAgentContext, candidates: DomainAgentDefinition[]): Promise<Set<string>> {
  if (candidates.length === 0) return new Set()

  const candidateIds = candidates.map((c) => c.agent)
  const candidateList = candidates.map((c) => `- ${c.agent}: ${c.description}`).join('\n')

  try {
    const response = await getAnthropicClient().messages.create({
      model: HAIKU_MODEL,
      max_tokens: 512,
      system: `You classify which optional domain micro-agents are relevant to a vendor's order-entry app, based on its name and catalog. Available agents:\n${candidateList}\n\nMost vendors are relevant to NONE of these — that is the expected, common outcome, not a failure to find something. Think about what the vendor's business actually IS first (a bakery, a hardware store, a stadium concession stand, a fan shop), then mark an agent true only if there's a direct, genuine connection to that specialty — not a loose word association or a stretch. For example: a stadium concession stand selling hot dogs and pretzels has a real connection to sports content, even though the word "sport" never appears; a sports team's fan shop selling jerseys and pennants obviously does too. A bakery, an office-supply store, or a plain hardware store has no real connection to any of these specialties, even if you can imagine a tenuous link — resist that temptation.`,
      messages: [
        {
          role: 'user',
          content: `Vendor: ${ctx.vendorName}\nCatalog items: ${ctx.catalogItemNames.join(', ') || '(none yet)'}`,
        },
      ],
      output_config: { format: { type: 'json_schema', schema: classifierSchema(candidateIds) } },
    })

    const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!block) return new Set()

    const parsed = JSON.parse(block.text) as Record<string, unknown>
    return new Set(candidateIds.filter((id) => parsed[id] === true))
  } catch (err) {
    const { category, logMessage } = classifyAnthropicError(err)
    console.error(`domainAgents: classification call failed [${category}] — ${logMessage}. Dispatching only always-on agents.`)
    return new Set()
  }
}

/**
 * Ordered subset of the registry: always-on agents first (registry order),
 * then whichever conditional agents classifyRelevantAgents() judged
 * relevant, also in registry order.
 */
export async function dispatchDomainAgents(ctx: DomainAgentContext): Promise<DomainAgentResult[]> {
  const conditional = REGISTRY.filter((def) => !def.alwaysOn)
  const relevant = await classifyRelevantAgents(ctx, conditional)
  return REGISTRY.filter((def) => def.alwaysOn || relevant.has(def.agent)).map((def) => def.run(ctx))
}
