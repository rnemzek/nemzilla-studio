export interface CookbookPreset {
  id: string
  label: string
  description: string
  /** Sent as /api/agent/stream's ?prompt= — matched by appGeneratorPrompt.ts's matchScenario(). */
  prompt: string
}

export const COOKBOOK_PRESETS: CookbookPreset[] = [
  {
    id: 'acme-order',
    label: 'ACME Order System',
    description: 'Synthetic catalog + governance/policy rules engine.',
    prompt: 'ACME Order',
  },
  {
    id: 'today-itinerary',
    label: '"My TODAY" Itinerary',
    description: 'Live web fetching (MLB, TheMealDB, Open-Meteo) + errand rules.',
    prompt: 'Today Itinerary',
  },
  {
    id: 'b2b-lead-scoring',
    label: 'B2B Lead Scoring Bot',
    description: 'Threshold rules + a simulated outbound webhook alert.',
    prompt: 'B2B Lead Scoring',
  },
]
