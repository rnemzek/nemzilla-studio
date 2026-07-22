/**
 * UOW-11 Task 11.5: the pluggable domain micro-agent registry. Each entry is
 * a self-contained { agent, detect, run } tuple — adding a new domain agent
 * means adding one more registry entry, never touching the dispatcher
 * (dispatchDomainAgents() below just filters + maps over this list, in
 * registry order). Detection is deterministic keyword matching against the
 * PO interview's vendor name/catalog item names, consistent with this
 * project's existing pattern (appGeneratorPrompt.ts's matchScenario()) of
 * simulating "AI" behavior with real, inspectable logic rather than a live
 * model call.
 */

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
  /** AI Vendor/AI OE return true unconditionally — every PO interview is fundamentally an order-entry app (see the UOW-11 vision doc's Scenario 1). */
  detect: (ctx: DomainAgentContext) => boolean
  run: (ctx: DomainAgentContext) => DomainAgentResult
}

function matchesAny(haystacks: string[], keywords: string[]): boolean {
  const normalized = haystacks.map((h) => h.toLowerCase())
  return keywords.some((keyword) => normalized.some((haystack) => haystack.includes(keyword)))
}

const REGISTRY: DomainAgentDefinition[] = [
  {
    agent: 'AI Vendor',
    detect: () => true,
    run: (ctx) => ({
      agent: 'AI Vendor',
      summary: `Modeled the product catalog schema for ${ctx.vendorName} (${ctx.catalogItemNames.length} item(s)).`,
      schema: { type: 'catalog', vendorName: ctx.vendorName, items: ctx.catalogItemNames },
    }),
  },
  {
    agent: 'AI OE',
    detect: () => true,
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
    detect: (ctx) => matchesAny([ctx.vendorName, ...ctx.catalogItemNames], ['task', 'todo', 'checklist', 'errand']),
    run: (ctx) => ({
      agent: 'AI TODO',
      summary: `Modeled a task/checklist widget alongside ${ctx.vendorName}'s catalog.`,
      schema: { type: 'todoList', tasks: [] },
    }),
  },
  {
    agent: 'AI Sport',
    detect: (ctx) => matchesAny([ctx.vendorName, ...ctx.catalogItemNames], ['sport', 'game', 'score', 'match', 'league', 'team']),
    run: (ctx) => ({
      agent: 'AI Sport',
      summary: `Modeled a live sports schedule/score widget (ESPN-style) for ${ctx.vendorName}.`,
      schema: { type: 'sportsWidget', source: 'ESPN', teams: [] },
    }),
  },
  {
    agent: 'AI SS',
    detect: (ctx) => matchesAny([ctx.vendorName, ...ctx.catalogItemNames], ['movie', 'stream', 'watch', 'film', 'show', 'tv']),
    run: (ctx) => ({
      agent: 'AI SS',
      summary: `Modeled a streaming/watchlist widget (TMDB-style) for ${ctx.vendorName}.`,
      schema: { type: 'streamingWidget', source: 'TMDB', titles: [] },
    }),
  },
  {
    agent: 'AI Food',
    detect: (ctx) =>
      matchesAny(
        [ctx.vendorName, ...ctx.catalogItemNames],
        ['food', 'recipe', 'meal', 'snack', 'restaurant', 'menu', 'dinner', 'lunch', 'breakfast'],
      ),
    run: (ctx) => ({
      agent: 'AI Food',
      summary: `Modeled a recipe/meal-planning widget (TheMealDB-style) for ${ctx.vendorName}.`,
      schema: { type: 'mealPlanner', source: 'TheMealDB', recipes: [] },
    }),
  },
]

export const DOMAIN_AGENT_IDS: string[] = REGISTRY.map((def) => def.agent)

/**
 * Ordered subset of the registry whose `detect()` matched — always includes
 * AI Vendor + AI OE first (registry order preserved), since every PO
 * interview is fundamentally an order-entry app. Everything else is genuinely
 * conditional on the interview's actual catalog/vendor content.
 */
export function dispatchDomainAgents(ctx: DomainAgentContext): DomainAgentResult[] {
  return REGISTRY.filter((def) => def.detect(ctx)).map((def) => def.run(ctx))
}
