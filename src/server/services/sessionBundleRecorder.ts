/**
 * UOW-11 session artifact bundle: unlike UOW-09's single-file
 * `.codex/demos/[session-id].json` (sessionSerializer.ts), a conversational
 * PO-driven build produces a multi-document trail — the interview transcript,
 * the architect's blueprint, the extracted catalog, the compiled policy
 * bounds, and the final app payload. Each is written independently as its
 * own artifact lands (transcript first, app payload last), so a bundle can
 * be partially populated while a build is still in progress.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface PoTranscriptEntry {
  role: 'po' | 'user'
  message: string
  timestamp: string
}

export interface CatalogItem {
  name: string
  price: number
}

export interface Catalog {
  vendorName: string
  items: CatalogItem[]
}

export interface PolicyRules {
  hitlThreshold: number
  autoApproveThreshold: number
  autoDenyThreshold: number
}

export interface AppPayload {
  scenario: string
  code: string
}

export interface SessionBundle {
  sessionId: string
  poTranscript: PoTranscriptEntry[] | null
  projectPlan: string | null
  catalog: Catalog | null
  policyRules: PolicyRules | null
  appPayload: AppPayload | null
}

const SESSIONS_DIR = path.join(process.cwd(), '.codex', 'sessions')

/** UUIDs only — `sessionId` reaches these functions from route params/POST bodies, and file paths are built from it. */
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId)
}

function bundleDir(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId)
}

const ARTIFACT_FILENAMES = {
  poTranscript: 'po-transcript.json',
  projectPlan: 'project-plan.md',
  catalog: 'catalog.json',
  policyRules: 'policy-rules.json',
  appPayload: 'app-payload.json',
} as const

export type ArtifactKey = keyof typeof ARTIFACT_FILENAMES
export const ARTIFACT_KEYS = Object.keys(ARTIFACT_FILENAMES) as ArtifactKey[]

export function isValidPoTranscript(v: unknown): v is PoTranscriptEntry[] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        e !== null &&
        typeof e === 'object' &&
        ((e as Record<string, unknown>).role === 'po' || (e as Record<string, unknown>).role === 'user') &&
        typeof (e as Record<string, unknown>).message === 'string' &&
        typeof (e as Record<string, unknown>).timestamp === 'string',
    )
  )
}

export function isValidCatalog(v: unknown): v is Catalog {
  if (v === null || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return (
    typeof c.vendorName === 'string' &&
    Array.isArray(c.items) &&
    c.items.every(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).name === 'string' &&
        typeof (item as Record<string, unknown>).price === 'number',
    )
  )
}

export function isValidPolicyRules(v: unknown): v is PolicyRules {
  if (v === null || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return (
    typeof p.hitlThreshold === 'number' && typeof p.autoApproveThreshold === 'number' && typeof p.autoDenyThreshold === 'number'
  )
}

export function isValidAppPayload(v: unknown): v is AppPayload {
  if (v === null || typeof v !== 'object') return false
  const a = v as Record<string, unknown>
  return typeof a.scenario === 'string' && typeof a.code === 'string'
}

async function writeArtifact(sessionId: string, key: ArtifactKey, serialized: string): Promise<void> {
  if (!isValidSessionId(sessionId)) throw new Error('invalid session id')
  await mkdir(bundleDir(sessionId), { recursive: true })
  await writeFile(path.join(bundleDir(sessionId), ARTIFACT_FILENAMES[key]), serialized, 'utf8')
}

export async function writePoTranscript(sessionId: string, entries: PoTranscriptEntry[]): Promise<void> {
  await writeArtifact(sessionId, 'poTranscript', JSON.stringify(entries, null, 2))
}

export async function writeProjectPlan(sessionId: string, markdown: string): Promise<void> {
  await writeArtifact(sessionId, 'projectPlan', markdown)
}

export async function writeCatalog(sessionId: string, catalog: Catalog): Promise<void> {
  await writeArtifact(sessionId, 'catalog', JSON.stringify(catalog, null, 2))
}

export async function writePolicyRules(sessionId: string, rules: PolicyRules): Promise<void> {
  await writeArtifact(sessionId, 'policyRules', JSON.stringify(rules, null, 2))
}

export async function writeAppPayload(sessionId: string, payload: AppPayload): Promise<void> {
  await writeArtifact(sessionId, 'appPayload', JSON.stringify(payload, null, 2))
}

async function readJsonArtifact<T>(sessionId: string, key: ArtifactKey): Promise<T | null> {
  try {
    const raw = await readFile(path.join(bundleDir(sessionId), ARTIFACT_FILENAMES[key]), 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Returns null only when *no* artifact of the bundle exists yet — a partially populated in-progress bundle still resolves. */
export async function readSessionBundle(sessionId: string): Promise<SessionBundle | null> {
  if (!isValidSessionId(sessionId)) return null

  let projectPlan: string | null
  try {
    projectPlan = await readFile(path.join(bundleDir(sessionId), ARTIFACT_FILENAMES.projectPlan), 'utf8')
  } catch {
    projectPlan = null
  }

  const [poTranscript, catalog, policyRules, appPayload] = await Promise.all([
    readJsonArtifact<PoTranscriptEntry[]>(sessionId, 'poTranscript'),
    readJsonArtifact<Catalog>(sessionId, 'catalog'),
    readJsonArtifact<PolicyRules>(sessionId, 'policyRules'),
    readJsonArtifact<AppPayload>(sessionId, 'appPayload'),
  ])

  if (!poTranscript && !projectPlan && !catalog && !policyRules && !appPayload) return null

  return { sessionId, poTranscript, projectPlan, catalog, policyRules, appPayload }
}
