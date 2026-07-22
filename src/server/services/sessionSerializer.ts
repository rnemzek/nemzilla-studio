import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AuditBlock } from './auditLedger.ts'

export interface SessionRecord {
  sessionId: string
  scenario: string
  prompt: string
  code: string
  timestamp: string
  auditBlocks: AuditBlock[]
}

export type SessionSummary = Pick<SessionRecord, 'sessionId' | 'scenario' | 'prompt' | 'timestamp'>

const DEMOS_DIR = path.join(process.cwd(), '.codex', 'demos')

/** UUIDs only — `sessionId` reaches loadSession() from a route param, and file paths are built from it. */
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId)
}

export async function recordCompletedBuild(record: Omit<SessionRecord, 'timestamp'>): Promise<void> {
  if (!isValidSessionId(record.sessionId)) return
  await mkdir(DEMOS_DIR, { recursive: true })
  const full: SessionRecord = { ...record, timestamp: new Date().toISOString() }
  await writeFile(path.join(DEMOS_DIR, `${record.sessionId}.json`), JSON.stringify(full, null, 2), 'utf8')
}

export async function listSavedSessions(): Promise<SessionSummary[]> {
  let entries: string[]
  try {
    entries = await readdir(DEMOS_DIR)
  } catch {
    return []
  }

  const summaries: SessionSummary[] = []
  for (const name of entries) {
    // "custom-*.json" recipes are saved separately via recipeSerializer.ts —
    // excluded here so the dropdown's auto-saved-runs and My Saved Recipes
    // sections don't double up on the same underlying directory.
    if (!name.endsWith('.json') || name.startsWith('custom-')) continue
    try {
      const raw = await readFile(path.join(DEMOS_DIR, name), 'utf8')
      const record = JSON.parse(raw) as SessionRecord
      summaries.push({
        sessionId: record.sessionId,
        scenario: record.scenario,
        prompt: record.prompt,
        timestamp: record.timestamp,
      })
    } catch {
      // skip an unreadable/corrupt file rather than failing the whole listing
    }
  }
  summaries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return summaries
}

export async function loadSession(sessionId: string): Promise<SessionRecord | null> {
  if (!isValidSessionId(sessionId)) return null
  try {
    const raw = await readFile(path.join(DEMOS_DIR, `${sessionId}.json`), 'utf8')
    return JSON.parse(raw) as SessionRecord
  } catch {
    return null
  }
}
