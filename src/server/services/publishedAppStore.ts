/**
 * Plan C UOW-3: persistent storage for published live apps — a single
 * file-backed JSON store (`data/published_apps.json`), not SQLite. This
 * project has an established zero-new-runtime-deps track record for exactly
 * this kind of need (auditLedger.ts's JSONL files, sessionSerializer.ts's
 * per-session JSON files), and a single small JSON object keyed by slug is
 * simplest for what's fundamentally a slug -> payload lookup with no
 * relational structure. An in-memory cache backs every read; every write
 * updates the cache and persists the whole file — fine for this app's
 * traffic level, same informality as the existing JSON-file stores.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface PublishedApp {
  slug: string
  title: string
  htmlPayload: string
  visitorId: string | null
  handle: string | null
  createdAt: string
}

const DATA_DIR = path.join(process.cwd(), 'data')
const STORE_PATH = path.join(DATA_DIR, 'published_apps.json')

const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/
const MAX_TITLE_LENGTH = 120
// Generous for a single-file micro-app (the largest generated snippets today
// run a few KB); guards against unbounded growth of the store file.
const MAX_HTML_LENGTH = 300_000

let cache: Record<string, PublishedApp> | null = null

async function loadStore(): Promise<Record<string, PublishedApp>> {
  if (cache) return cache
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    cache = JSON.parse(raw) as Record<string, PublishedApp>
  } catch {
    cache = {}
  }
  return cache
}

async function persistStore(store: Record<string, PublishedApp>): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8')
}

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && SLUG_PATTERN.test(slug)
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
}

const STOP_WORDS = new Set(['my', 'the', 'a', 'an', 'today', 'app', 'live'])

/** A single meaningful keyword from the title (e.g. "itinerary" out of "My TODAY Itinerary") — not an exact algorithm, just a readable tag. */
function typeTag(title: string): string {
  const words = slugify(title)
    .split('-')
    .filter((w) => w && !STOP_WORDS.has(w))
  return words[0] || 'app'
}

function datePart(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${mm}${dd}${date.getFullYear()}`
}

/** Real, readable slugs (e.g. "karen-07242026-itinerary") rather than opaque ids. */
function generateSlugBase(title: string, handle: string | null): string {
  const firstName = handle ? (handle.split(/[\s-]/)[0] ?? handle) : 'guest'
  const namePart = slugify(firstName) || 'guest'
  return `${namePart}-${datePart(new Date())}-${typeTag(title)}`.slice(0, 70)
}

export interface PublishAppInput {
  slug?: string
  title: string
  htmlPayload: string
  visitorId?: string | null
  handle?: string | null
}

export type PublishAppResult = { app: PublishedApp } | { error: string }

export async function publishApp(input: PublishAppInput): Promise<PublishAppResult> {
  const title = input.title.trim().slice(0, MAX_TITLE_LENGTH)
  if (!title) return { error: 'title is required' }
  if (!input.htmlPayload || input.htmlPayload.length > MAX_HTML_LENGTH) {
    return { error: `htmlPayload is required and must be under ${MAX_HTML_LENGTH} characters` }
  }

  const store = await loadStore()

  let slug: string
  if (input.slug) {
    if (!isValidSlug(input.slug)) return { error: 'invalid slug — use lowercase letters, numbers, and dashes only' }
    // An explicitly-requested slug is allowed to overwrite its own prior
    // publish (a visitor re-publishing an update to the same link) — only
    // auto-generated slugs get collision-avoidance below.
    slug = input.slug
  } else {
    const base = generateSlugBase(title, input.handle ?? null)
    slug = base
    let suffix = 2
    while (store[slug]) {
      slug = `${base}-${suffix}`
      suffix += 1
    }
  }

  const app: PublishedApp = {
    slug,
    title,
    htmlPayload: input.htmlPayload,
    visitorId: input.visitorId ?? null,
    handle: input.handle ?? null,
    createdAt: new Date().toISOString(),
  }

  store[slug] = app
  await persistStore(store)
  return { app }
}

export async function getPublishedApp(slug: string): Promise<PublishedApp | null> {
  if (!isValidSlug(slug)) return null
  const store = await loadStore()
  return store[slug] ?? null
}
