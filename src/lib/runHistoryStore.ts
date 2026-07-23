import { createStore } from 'solid-js/store'
import type { AuditBlock } from './auditStore.ts'
import type { PoCatalogItem, PoTranscriptEntry } from './poInterview.ts'

export interface SavedRunPolicyRules {
  hitlThreshold: number
  autoApproveThreshold: number
  autoDenyThreshold: number
}

export interface SavedRunCatalog {
  vendorName: string
  items: PoCatalogItem[]
}

export interface SavedRun {
  id: string
  name: string
  createdAt: string
  transcript: PoTranscriptEntry[]
  catalog: SavedRunCatalog | null
  policyRules: SavedRunPolicyRules | null
  auditBlocks: AuditBlock[]
  code: string
}

const STORAGE_KEY = 'nemzilla-studio:run-history'
const MAX_RUNS = 20

function loadFromStorage(): SavedRun[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedRun[]) : []
  } catch {
    return []
  }
}

function persistToStorage(runs: SavedRun[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs))
  } catch (err) {
    console.error('runHistoryStore: failed to persist to localStorage', err)
  }
}

const [state, setState] = createStore<{ runs: SavedRun[] }>({ runs: loadFromStorage() })

/** Reactive — ArtifactsPanel.tsx reads this directly for the "Run History" sub-tab. */
export const runHistoryState = state

export interface SaveRunInput {
  name: string
  transcript: PoTranscriptEntry[]
  catalog: SavedRunCatalog | null
  policyRules: SavedRunPolicyRules | null
  auditBlocks: AuditBlock[]
  code: string
}

/**
 * Pass A "Save Run": unlike recipeStore.ts's code-only Cookbook save, this
 * captures the full session bundle — discovery transcript, extracted
 * catalog/policy schema, this run's own audit ledger blocks, and the
 * generated app code — entirely in localStorage. Deliberately no server
 * round-trip: this is a personal, browser-local run history for inspection,
 * not a shared archive (see recipeStore.ts/sessionSerializer.ts for that).
 */
export function saveRun(input: SaveRunInput): SavedRun {
  const run: SavedRun = {
    id: crypto.randomUUID(),
    name: input.name,
    createdAt: new Date().toISOString(),
    transcript: input.transcript,
    catalog: input.catalog,
    policyRules: input.policyRules,
    auditBlocks: input.auditBlocks,
    code: input.code,
  }

  const next = [run, ...state.runs].slice(0, MAX_RUNS)
  setState('runs', next)
  persistToStorage(next)
  return run
}

export function deleteRun(id: string): void {
  const next = state.runs.filter((run) => run.id !== id)
  setState('runs', next)
  persistToStorage(next)
}
