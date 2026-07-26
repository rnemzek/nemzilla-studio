/**
 * Phase 2: gives the AI PO interviewer real tools to call instead of
 * disclaiming "I don't have real-time data" whenever a visitor mentions a
 * specific recipe, a sports team's game, or a grocery item to price out.
 * This is a demo/portfolio app (see ExecutiveShowcaseModal.tsx) with no
 * external API keys configured, so these handlers are deterministic mock
 * data generators rather than live fetches — same spirit as sandboxStore.ts's
 * simulated swarm build. Each handler returns both a plain-text summary (fed
 * back to the model as the tool_result, so it can reference specifics in its
 * reply) and a structured `EnrichmentCard` the frontend renders as a real
 * visual card (see EnrichmentCardView.tsx) instead of raw prose.
 */
import type Anthropic from '@anthropic-ai/sdk'

export interface RecipeCard {
  type: 'recipe'
  title: string
  servings: number
  prepTimeMinutes: number
  ingredients: Array<{ name: string; quantity: string }>
  steps: string[]
}

export interface SportsCard {
  type: 'sports'
  team: string
  games: Array<{ opponent: string; date: string; time: string; venue: string; broadcast: string; streamUrl: string }>
}

export interface GroceryCard {
  type: 'grocery'
  item: string
  stores: Array<{ name: string; price: number }>
  cheapest: string
}

export type EnrichmentCard = RecipeCard | SportsCard | GroceryCard

export const ENRICHMENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_recipe_details',
    description:
      "Look up a recipe by dish name (e.g. a Paula Deen-style comfort food recipe) and return its ingredient list with quantities plus numbered cooking steps. Call this whenever the visitor names a specific dish or recipe for a dinner plan or itinerary — never describe a recipe from memory or say you don't have recipe data.",
    input_schema: {
      type: 'object',
      properties: {
        dish: { type: 'string', description: 'The dish or recipe name, e.g. "Paula Deen banana pudding" or "chicken parmesan"' },
        servings: { type: 'number', description: "Desired serving count, if the visitor mentioned one" },
      },
      required: ['dish'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_sports_schedule_and_streams',
    description:
      "Look up the upcoming game schedule and broadcast/streaming info for a sports team (e.g. the Orioles). Call this whenever the visitor mentions watching or planning around a specific team's game — never say you don't have live schedule data.",
    input_schema: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'Team name, e.g. "Orioles" or "O\'s"' },
      },
      required: ['team'],
      additionalProperties: false,
    },
  },
  {
    name: 'compare_grocery_prices',
    description:
      "Compare a grocery item's price across nearby stores (e.g. Harris Teeter, Aldi, Walmart) to help price out a catalog item or shopping errand. Call this whenever the visitor is pricing groceries — never guess a price or say you don't have pricing data.",
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'The grocery item to price, e.g. "chicken breast" or "eggs"' },
      },
      required: ['item'],
      additionalProperties: false,
    },
  },
]

/** Small deterministic hash so the same query always returns the same mock data within a session, instead of re-rolling every turn. */
function seededIndex(seed: string, length: number): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return hash % length
}

const RECIPE_LIBRARY: Record<string, Omit<RecipeCard, 'type' | 'servings'> & { baseServings: number }> = {
  'banana pudding': {
    title: "Paula Deen-Style Banana Pudding",
    baseServings: 8,
    prepTimeMinutes: 25,
    ingredients: [
      { name: 'Vanilla wafers', quantity: '1 (12 oz) box' },
      { name: 'Ripe bananas', quantity: '6, sliced' },
      { name: 'Sweetened condensed milk', quantity: '1 (14 oz) can' },
      { name: 'Cold water', quantity: '1 1/2 cups' },
      { name: 'Instant vanilla pudding mix', quantity: '1 (3.4 oz) box' },
      { name: 'Cream cheese', quantity: '8 oz, softened' },
      { name: 'Whipped topping', quantity: '1 (8 oz) tub, thawed' },
    ],
    steps: [
      'Line the bottom of a 9x13 dish with vanilla wafers, then a layer of sliced bananas.',
      'Beat cream cheese and condensed milk until smooth; whisk in cold water and pudding mix until thick.',
      'Fold in the whipped topping.',
      'Spread half the pudding mixture over the wafers and bananas; repeat layers.',
      'Top with remaining wafers and chill at least 4 hours before serving.',
    ],
  },
  'chicken parmesan': {
    title: 'Classic Chicken Parmesan',
    baseServings: 4,
    prepTimeMinutes: 40,
    ingredients: [
      { name: 'Boneless chicken breasts', quantity: '4, pounded thin' },
      { name: 'Panko breadcrumbs', quantity: '1 1/2 cups' },
      { name: 'Grated parmesan', quantity: '1/2 cup' },
      { name: 'Eggs', quantity: '2, beaten' },
      { name: 'Marinara sauce', quantity: '2 cups' },
      { name: 'Shredded mozzarella', quantity: '1 1/2 cups' },
      { name: 'Spaghetti', quantity: '1 lb, cooked' },
    ],
    steps: [
      'Dredge chicken in egg, then a mix of panko and parmesan.',
      'Pan-fry in olive oil until golden, about 3 minutes per side.',
      'Top each cutlet with marinara and mozzarella; bake at 425°F for 12 minutes until bubbly.',
      'Serve over cooked spaghetti with extra sauce.',
    ],
  },
  'tacos': {
    title: 'Weeknight Ground Beef Tacos',
    baseServings: 4,
    prepTimeMinutes: 20,
    ingredients: [
      { name: 'Ground beef', quantity: '1 lb' },
      { name: 'Taco seasoning', quantity: '1 packet' },
      { name: 'Corn tortillas', quantity: '8' },
      { name: 'Shredded cheddar', quantity: '1 cup' },
      { name: 'Diced tomato', quantity: '1 cup' },
      { name: 'Shredded lettuce', quantity: '1 cup' },
    ],
    steps: [
      'Brown ground beef over medium-high heat; drain excess fat.',
      'Stir in taco seasoning and 2/3 cup water; simmer 5 minutes.',
      'Warm tortillas and fill with beef, cheese, tomato, and lettuce.',
    ],
  },
}

const FALLBACK_RECIPE_STEPS = [
  'Gather and prep all ingredients (mise en place).',
  'Cook the base component over medium heat until done through.',
  'Combine with remaining ingredients and season to taste.',
  'Plate and serve warm.',
]

function getRecipeDetails(dish: string, servings?: number): { content: string; card: RecipeCard } {
  const query = dish.trim().toLowerCase()
  const match = Object.entries(RECIPE_LIBRARY).find(([key]) => query.includes(key))

  if (match) {
    const [, recipe] = match
    const card: RecipeCard = { type: 'recipe', servings: servings ?? recipe.baseServings, title: recipe.title, prepTimeMinutes: recipe.prepTimeMinutes, ingredients: recipe.ingredients, steps: recipe.steps }
    return { content: `Recipe "${card.title}" — ${card.ingredients.length} ingredients, ${card.steps.length} steps, ~${card.prepTimeMinutes} min prep, serves ${card.servings}.`, card }
  }

  const title = dish
    .trim()
    .split(/\s+/)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
  const card: RecipeCard = {
    type: 'recipe',
    title,
    servings: servings ?? 4,
    prepTimeMinutes: 30 + (seededIndex(query, 5) * 5),
    ingredients: [
      { name: 'Main ingredient', quantity: 'to taste' },
      { name: 'Aromatics (onion, garlic)', quantity: '1 each' },
      { name: 'Seasoning blend', quantity: '1 tbsp' },
      { name: 'Cooking oil', quantity: '2 tbsp' },
    ],
    steps: FALLBACK_RECIPE_STEPS,
  }
  return { content: `Recipe "${card.title}" — ${card.ingredients.length} ingredients, ${card.steps.length} steps, ~${card.prepTimeMinutes} min prep, serves ${card.servings}.`, card }
}

const BROADCASTS = ['MASN', 'FOX', 'ESPN', 'Apple TV+', 'TBS']
const VENUES = ['home', 'away']
const OPPONENTS_BY_TEAM: Record<string, string[]> = {
  orioles: ['Yankees', 'Red Sox', 'Rays', 'Blue Jays'],
  os: ['Yankees', 'Red Sox', 'Rays', 'Blue Jays'],
  nationals: ['Phillies', 'Mets', 'Braves', 'Marlins'],
  ravens: ['Steelers', 'Bengals', 'Browns', 'Patriots'],
}

function getSportsSchedule(team: string): { content: string; card: SportsCard } {
  const key = team.trim().toLowerCase().replace(/[^a-z]/g, '')
  const opponents = OPPONENTS_BY_TEAM[key] ?? ['Rivals FC', 'City United', 'North Division Leaders']
  const today = new Date()

  const games = Array.from({ length: 3 }, (_, i) => {
    const gameDate = new Date(today)
    gameDate.setDate(today.getDate() + 1 + i * 2)
    const opponent = opponents[seededIndex(`${key}-${i}`, opponents.length)]!
    const venue = VENUES[seededIndex(`${key}-${i}-venue`, VENUES.length)]!
    const broadcast = BROADCASTS[seededIndex(`${key}-${i}-tv`, BROADCASTS.length)]!
    return {
      opponent,
      date: gameDate.toISOString().slice(0, 10),
      time: `${6 + (i % 3)}:0${i === 1 ? '5' : '0'} PM ET`,
      venue: venue === 'home' ? `${team.trim()} (home)` : `at ${opponent}`,
      broadcast,
      streamUrl: `https://www.mlb.tv/game/${key}-vs-${opponent.toLowerCase().replace(/\s+/g, '-')}`,
    }
  })

  const card: SportsCard = { type: 'sports', team: team.trim(), games }
  return { content: `${card.team}: next ${card.games.length} games — next up ${card.games[0]!.opponent} on ${card.games[0]!.date} (${card.games[0]!.broadcast}).`, card }
}

const GROCERY_STORES = ['Harris Teeter', 'Aldi', 'Walmart', 'Whole Foods', 'Safeway']

function compareGroceryPrices(item: string): { content: string; card: GroceryCard } {
  const key = item.trim().toLowerCase()
  const basePrice = 2 + (seededIndex(key, 12) * 0.75)

  const stores = GROCERY_STORES.map((name, i) => {
    // Aldi consistently cheapest, Whole Foods consistently priciest — matches real-world pricing patterns for a more convincing demo.
    const spread = [-0.6, -0.9, 0, 0.4, 0.75][i]!
    const price = Math.max(0.5, basePrice + spread + (seededIndex(`${key}-${name}`, 5) * 0.1))
    return { name, price: Math.round(price * 100) / 100 }
  })

  const cheapest = stores.reduce((min, s) => (s.price < min.price ? s : min), stores[0]!)
  const card: GroceryCard = { type: 'grocery', item: item.trim(), stores, cheapest: cheapest.name }
  return { content: `${card.item}: cheapest at ${cheapest.name} ($${cheapest.price.toFixed(2)}), ${stores.length} stores compared.`, card }
}

export function executeEnrichmentTool(name: string, input: Record<string, unknown>): { content: string; card: EnrichmentCard } | null {
  switch (name) {
    case 'get_recipe_details':
      return getRecipeDetails(typeof input.dish === 'string' ? input.dish : '', typeof input.servings === 'number' ? input.servings : undefined)
    case 'get_sports_schedule_and_streams':
      return getSportsSchedule(typeof input.team === 'string' ? input.team : '')
    case 'compare_grocery_prices':
      return compareGroceryPrices(typeof input.item === 'string' ? input.item : '')
    default:
      return null
  }
}
