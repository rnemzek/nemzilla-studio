/**
 * Pass E: the Multi-Agent Swarm Catalog's foundation. A `DomainTemplate`
 * describes one selectable "domain swarm" — its own agent personas (for the
 * Swarm Canvas's idle preview), its own AI PO conversation flavor (an
 * overlay appended to the base discovery system prompt, not a replacement of
 * it — see the note on `systemPromptOverlay` below), and, where a real
 * generator already exists, a seed prompt that routes App Preview's
 * `matchScenario()` (appGeneratorPrompt.ts) to it.
 *
 * Shared between the browser (templateStore.ts, SwarmCanvas.tsx,
 * AppPreview.tsx) and the server (poInterviewLLM.ts) — mirrors
 * `actionKit.ts`'s established pattern for a file that must type-check under
 * both tsconfig projects (see tsconfig.node.json's explicit include entry)
 * rather than duplicating this data on each side of that boundary.
 */

export interface SwarmNodePersona {
  /** Display name — this is what actually appears as the Swarm Canvas node label during the idle preview. */
  agent: string
  /** One-line role shown under the node, same spot the live pipeline's role/micro-status text occupies. */
  role: string
  /**
   * A literal color token, not a Tailwind class string — SwarmCanvas.tsx
   * maps this through its own static `Record<string, string>` lookup so
   * every class name Tailwind needs to see stays a literal in source
   * (dynamically interpolating `stroke-${color}-400` would be silently
   * purged from the production build).
   */
  color: string
}

export interface DomainTemplate {
  id: string
  name: string
  description: string
  /**
   * Appended to (never replacing) `poInterviewLLM.ts`'s base `SYSTEM_PROMPT`
   * — reframes the *vocabulary* of the existing vendorName/catalog/
   * hitlThreshold discovery into this domain's own terms. A fully bespoke
   * conversation flow (its own structured-output schema per domain) is a
   * larger follow-up than this kickstart's scope; this overlay is real and
   * wired end-to-end, just intentionally reusing the one proven extraction
   * contract rather than forking it three ways.
   */
  systemPromptOverlay: string
  /** 2-4 personas — rendered as the Swarm Canvas's idle placeholder nodes whenever this template is active and no real pipeline is currently running. */
  swarmNodes: SwarmNodePersona[]
  /**
   * `matchScenario()` id (appGeneratorPrompt.ts) this domain already has a
   * real generator for, or `null` if App Preview doesn't have a dedicated
   * one yet — surfaced honestly in the UI ("preview coming soon") rather
   * than silently falling through to the generic default-sandbox card under
   * a misleading domain label.
   */
  previewScenario: 'acme-order' | 'today-itinerary' | 'b2b-lead-scoring' | null
  /** The seed prompt `sandboxStore.connectGenerator()` sends when a visitor asks to preview this domain's demo. */
  previewPrompt: string
}

export const TEMPLATE_REGISTRY: DomainTemplate[] = [
  {
    id: 'order-entry',
    name: 'Order Entry (B2B)',
    description: 'ACME Corp order-entry & approval — catalog, cart, and a HITL policy interceptor.',
    systemPromptOverlay:
      'Domain flavor: a classic B2B order-entry workflow. Keep the discovery centered on a vendor/company name, a product catalog with prices, and a supervisor approval threshold.',
    swarmNodes: [
      { agent: 'AI PO', role: 'Discovery & requirements', color: 'sky' },
      { agent: 'Policy Auditor', role: 'Governance & HITL thresholds', color: 'amber' },
      { agent: 'Order Fulfillment Agent', role: 'Cart, checkout & shipping', color: 'emerald' },
    ],
    previewScenario: 'acme-order',
    previewPrompt: 'ACME Order',
  },
  {
    id: 'wfd',
    name: "What's For Dinner",
    description: 'Home meal planning — pantry check, recipe pick, and something to watch while you cook.',
    systemPromptOverlay:
      "Domain flavor: planning a home dinner, not a B2B order. Treat the vendor/company name as the household or meal event's name, the catalog as recipe ingredients or meal options with a per-serving cost, and the approval threshold as a grocery budget line the host wants a heads-up above.",
    swarmNodes: [
      { agent: 'Sous-Chef Agent', role: 'Recipe selection & prep steps', color: 'orange' },
      { agent: 'Grocery Pantry Agent', role: 'Ingredient & pantry tracking', color: 'lime' },
      { agent: 'Media Linker Agent', role: 'Dinner-and-a-show pairing', color: 'fuchsia' },
    ],
    previewScenario: null,
    previewPrompt: "What's For Dinner",
  },
  {
    id: 'itinerary',
    name: 'Day Planner & Entertainment',
    description: "Today's itinerary — game tracker, movie finder, and a schedule orchestrator.",
    systemPromptOverlay:
      "Domain flavor: planning a day's itinerary and entertainment lineup, not a B2B order. Treat the vendor/company name as the day or event's name, the catalog as planned activities or tickets with a cost each, and the approval threshold as a spending line for the day.",
    swarmNodes: [
      { agent: 'Sports-Sync Agent', role: "O's game tracker", color: 'red' },
      { agent: 'Movie-Stream Finder', role: 'Trending picks to watch', color: 'violet' },
      { agent: 'Schedule Orchestrator', role: 'Errands & timing', color: 'cyan' },
    ],
    previewScenario: 'today-itinerary',
    previewPrompt: 'My TODAY Itinerary',
  },
]

export const DEFAULT_TEMPLATE_ID = TEMPLATE_REGISTRY[0]!.id

export function getTemplate(id: string): DomainTemplate | null {
  return TEMPLATE_REGISTRY.find((t) => t.id === id) ?? null
}
