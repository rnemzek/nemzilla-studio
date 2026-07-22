import { createHash } from 'node:crypto'
import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'

export type PolicyStatus = 'allowed' | 'denied' | 'clamped'

export interface AuditBlock {
  index: number
  timestamp: string
  action: string
  payload: unknown
  policyStatus: PolicyStatus
  prevHash: string
  hash: string
  /** Not part of the hash formula (metadata only) — lets a completed build's own trail be filtered out via getSessionAuditBlocks(). */
  sessionId?: string
}

const GENESIS_HASH = '0'.repeat(64)
const QUEUE_CAPACITY = 200
const CHAIN_MEMORY_CAP = 2000
const BACKLOG_SIZE = 100
const AUDIT_DIR = path.join(process.cwd(), '.codex', 'audits')
const RETENTION_MS = 72 * 60 * 60 * 1000
const RETENTION_SWEEP_MS = 30 * 60 * 1000

interface PendingEvent {
  action: string
  payload: unknown
  policyStatus: PolicyStatus
  sessionId?: string
}

const queue: PendingEvent[] = []
const chain: AuditBlock[] = []
const subscribers = new Set<(block: AuditBlock) => void>()
let draining = false

function hashBlock(prevHash: string, timestamp: string, payload: unknown): string {
  return createHash('sha256')
    .update(prevHash + timestamp + JSON.stringify(payload))
    .digest('hex')
}

function auditFilePath(date: Date): string {
  const day = date.toISOString().slice(0, 10)
  return path.join(AUDIT_DIR, `audit-${day}.jsonl`)
}

async function persistBlock(block: AuditBlock): Promise<void> {
  await mkdir(AUDIT_DIR, { recursive: true })
  await appendFile(auditFilePath(new Date(block.timestamp)), JSON.stringify(block) + '\n', 'utf8')
}

async function drainQueue(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (queue.length > 0) {
      const event = queue.shift()!
      const prevHash = chain.length > 0 ? chain[chain.length - 1]!.hash : GENESIS_HASH
      const timestamp = new Date().toISOString()
      const hash = hashBlock(prevHash, timestamp, event.payload)
      const block: AuditBlock = {
        index: chain.length,
        timestamp,
        action: event.action,
        payload: event.payload,
        policyStatus: event.policyStatus,
        prevHash,
        hash,
        sessionId: event.sessionId,
      }

      chain.push(block)
      if (chain.length > CHAIN_MEMORY_CAP) chain.shift()

      // Persistence/broadcast are off the caller's hot path already (this is
      // the background worker), but never let one bad write wedge the drain loop.
      await persistBlock(block).catch((err) => {
        console.error('auditLedger: failed to persist block', err)
      })

      for (const notify of subscribers) notify(block)
    }
  } finally {
    draining = false
  }
}

/** Non-blocking: enqueues and returns immediately. Hashing/persistence happen on a background drain. */
export function enqueueAuditEvent(
  action: string,
  payload: unknown,
  policyStatus: PolicyStatus = 'allowed',
  sessionId?: string,
): void {
  if (queue.length >= QUEUE_CAPACITY) queue.shift()
  queue.push({ action, payload, policyStatus, sessionId })
  setImmediate(drainQueue)
}

export function getChainBacklog(limit = BACKLOG_SIZE): AuditBlock[] {
  return chain.slice(-limit)
}

/**
 * All blocks tagged with a given sessionId — used to correlate a completed
 * build's own audit trail for session serialization. Filtering by sessionId
 * (rather than an index range captured before/after the run) stays correct
 * even when a new build's own audit events start landing in the chain
 * before this one's last few events have finished draining — which happens
 * routinely, since a fresh connection can claim the next build immediately
 * after this one ends.
 */
export function getSessionAuditBlocks(sessionId: string): AuditBlock[] {
  return chain.filter((block) => block.sessionId === sessionId)
}

function subscribe(cb: (block: AuditBlock) => void): () => void {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

export function auditStreamHandler(c: Context) {
  return streamSSE(c, async (stream) => {
    let eventId = 0
    let aborted = false
    stream.onAbort(() => {
      aborted = true
    })

    const send = (block: AuditBlock) =>
      stream.writeSSE({ event: 'audit_block', id: String(eventId++), data: JSON.stringify(block) })

    // Subscribe BEFORE reading the backlog snapshot, and feed both into the
    // same buffer. Reading the backlog first (as an earlier version of this
    // handler did) leaves a gap between "snapshot taken" and "subscribed"
    // during which a concurrently-produced block is neither in the snapshot
    // nor caught by the not-yet-registered subscriber — silently dropped for
    // this connection, breaking the *client's* contiguous view of an
    // otherwise perfectly valid chain. Buffering + strict sequential replay
    // below closes that window regardless of timing.
    const seen = new Set<number>()
    const pending: AuditBlock[] = []
    let lastSentIndex = -1
    let initialized = false
    let wake = () => {}

    function push(block: AuditBlock) {
      if (seen.has(block.index)) return
      seen.add(block.index)
      pending.push(block)
      pending.sort((a, b) => a.index - b.index)
      wake()
    }

    const unsubscribe = subscribe(push)
    stream.onAbort(() => unsubscribe())

    for (const block of getChainBacklog()) push(block)

    while (!aborted) {
      if (!initialized && pending.length > 0) {
        lastSentIndex = pending[0]!.index - 1
        initialized = true
      }
      while (pending.length > 0 && pending[0]!.index === lastSentIndex + 1) {
        const block = pending.shift()!
        lastSentIndex = block.index
        await send(block)
      }
      if (aborted) return
      await new Promise<void>((resolve) => {
        wake = resolve
        stream.onAbort(resolve)
      })
      wake = () => {}
    }
  })
}

async function pruneOldLogs(): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(AUDIT_DIR)
  } catch {
    return // directory doesn't exist yet — nothing to prune
  }

  const now = Date.now()
  await Promise.all(
    entries.map(async (name) => {
      const filePath = path.join(AUDIT_DIR, name)
      try {
        const info = await stat(filePath)
        if (now - info.mtimeMs > RETENTION_MS) await unlink(filePath)
      } catch (err) {
        console.error(`auditLedger: retention sweep failed for ${name}`, err)
      }
    }),
  )
}

pruneOldLogs()
setInterval(pruneOldLogs, RETENTION_SWEEP_MS).unref()
