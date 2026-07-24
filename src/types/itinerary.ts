/**
 * Pass E "Plan C": the Unified Itinerary Synthesizer's schema — folds
 * errands (TODO), culinary (WFD), and entertainment into one
 * `UnifiedItineraryPayload` instead of three separate domain silos. Matches
 * the schema already committed to `.codex/AGENTZ-STUDIO-SDK.md`'s Plan C
 * spec (kept in sync deliberately, not reinvented here) so the eventual
 * edge-publishing work described there can consume the same shape without a
 * migration.
 *
 * Shared across the browser/server tsconfig boundary the same way
 * `templateRegistry.ts`/`actionKit.ts` already are — see
 * `tsconfig.node.json`'s explicit include entry.
 */

export type ItineraryTaskCategory = 'errand' | 'culinary' | 'entertainment'

export interface ItineraryChecklistItem {
  id: string
  text: string
  completed: boolean
}

export interface ItineraryTaskDetails {
  /** Ingredient list (culinary) or sub-steps (errand) — the interactive checklist rendered under the task. */
  checklist?: ItineraryChecklistItem[]
  /** A recipe (or similar) link — e.g. the Paula Deen Pecan Chicken Salad search. */
  externalUrl?: string
  /** Display string for where this is streaming (e.g. "MASN, YouTube TV") — kept a single field to match the Plan C schema; multiple providers are comma-joined rather than a nested array. */
  streamingProvider?: string
  notes?: string
}

export interface ItineraryTask {
  id: string
  category: ItineraryTaskCategory
  title: string
  time?: string
  location?: string
  details?: ItineraryTaskDetails
}

export interface UnifiedItineraryPayload {
  slug: string
  title: string
  date: string
  createdAt: string
  updatedAt: string
  tasks: ItineraryTask[]
}
