/**
 * Registry of pre-validated, zero-auth, CORS-friendly public APIs available to
 * generated micro-apps' "Engine B" (Live Action Kit). Shared between server
 * (prompt/template synthesis in src/server/prompts/appGeneratorPrompt.ts) and
 * client (available for UI that wants to describe what a generated app can
 * reach) — kept dependency-free so it type-checks under both tsconfig
 * projects (see tsconfig.node.json's explicit include of this one file).
 */

export interface ActionKitParam {
  name: string
  description: string
}

export interface ActionKitEndpoint {
  id: string
  label: string
  baseUrl: string
  method: 'GET'
  description: string
  sampleQuery: string
  params: ActionKitParam[]
  /** Used by generated apps as an offline/CORS-failure fallback so a demo never renders empty. */
  fallbackMock: unknown
}

export const ACTION_KIT_REGISTRY: ActionKitEndpoint[] = [
  {
    id: 'mlb-schedule',
    label: 'MLB Stats API — Schedule',
    baseUrl: 'https://statsapi.mlb.com/api/v1/schedule',
    method: 'GET',
    description: 'Live MLB schedule and scores for a given sportId (1 = MLB).',
    sampleQuery: 'https://statsapi.mlb.com/api/v1/schedule?sportId=1',
    params: [{ name: 'sportId', description: 'League id — 1 for MLB.' }],
    fallbackMock: {
      dates: [
        {
          games: [
            {
              gameDate: new Date().toISOString(),
              teams: {
                away: { team: { name: 'New York Yankees' } },
                home: { team: { name: 'Baltimore Orioles' } },
              },
            },
          ],
        },
      ],
    },
  },
  {
    id: 'themealdb-search',
    label: 'TheMealDB — Recipe Search',
    baseUrl: 'https://www.themealdb.com/api/json/v1/1/search.php',
    method: 'GET',
    description: 'Search recipes by name or ingredient.',
    sampleQuery: 'https://www.themealdb.com/api/json/v1/1/search.php?s=chicken',
    params: [{ name: 's', description: 'Search term, e.g. "chicken".' }],
    fallbackMock: {
      meals: [
        {
          strMeal: 'Chicken Handi',
          strInstructions:
            'Marinate the chicken, sear it, then simmer in a spiced tomato-yogurt sauce until tender.',
          strMealThumb: 'https://www.themealdb.com/images/media/meals/wyxwsp1486979827.jpg',
        },
      ],
    },
  },
  {
    id: 'open-meteo-forecast',
    label: 'Open-Meteo — Weather Forecast',
    baseUrl: 'https://api.open-meteo.com/v1/forecast',
    method: 'GET',
    description: 'Hourly/current forecast for a lat/lon pair — no API key required.',
    sampleQuery:
      'https://api.open-meteo.com/v1/forecast?latitude=39.29&longitude=-76.61&current_weather=true',
    params: [
      { name: 'latitude', description: 'Latitude, e.g. 39.29 (Baltimore).' },
      { name: 'longitude', description: 'Longitude, e.g. -76.61 (Baltimore).' },
      { name: 'current_weather', description: '"true" to include the current-conditions snapshot.' },
    ],
    fallbackMock: {
      current_weather: { temperature: 25.8, windspeed: 9.6, weathercode: 1, time: new Date().toISOString() },
    },
  },
]

export function findActionKitEndpoint(id: string): ActionKitEndpoint | undefined {
  return ACTION_KIT_REGISTRY.find((entry) => entry.id === id)
}
