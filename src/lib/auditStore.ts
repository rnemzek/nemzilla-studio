import { createStore, produce } from 'solid-js/store'

export type PolicyStatus = 'allowed' | 'denied' | 'clamped'
export type ChainStatus = 'pending' | 'verified' | 'broken'

export interface AuditBlock {
  index: number
  timestamp: string
  action: string
  payload: unknown
  policyStatus: PolicyStatus
  prevHash: string
  hash: string
}

export interface AuditState {
  blocks: AuditBlock[]
  chainStatus: ChainStatus
  connected: boolean
}

export interface AuditStore {
  state: AuditState
  /** Opens a fresh SSE connection to /api/audit/stream. Returns a function to disconnect. */
  connect: () => () => void
}

const MAX_BLOCKS = 300

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function parseFrame(chunk: string): { event: string; data: Record<string, unknown> } {
  let event = ''
  const dataLines: string[] = []
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice('event: '.length)
    else if (line.startsWith('data: ')) dataLines.push(line.slice('data: '.length))
  }
  if (!event || dataLines.length === 0) return { event: '', data: {} }
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) as Record<string, unknown> }
  } catch {
    return { event: '', data: {} }
  }
}

/**
 * Owns the audit ledger's reactive state and independently re-verifies the
 * SHA-256 hash chain client-side (Web Crypto, not a server-reported flag) as
 * each block streams in — genuine tamper-evidence means not trusting the
 * source's self-report.
 *
 * The server only sends the most recent backlog on connect (not full
 * history), so verification anchors on the first block actually observed
 * rather than always proving all the way back to the genesis block — each
 * subsequent block's `hash` is still independently recomputed from
 * `prevHash + timestamp + payload` and checked against both the previous
 * block's hash and its own reported hash.
 */
export function createAuditStore(): AuditStore {
  const [state, setState] = createStore<AuditState>({
    blocks: [],
    chainStatus: 'pending',
    connected: false,
  })

  function connect(): () => void {
    const controller = new AbortController()
    let lastHash: string | null = null
    let broken = false

    setState({ blocks: [], chainStatus: 'pending', connected: true })

    async function handleBlock(block: AuditBlock) {
      if (broken) return

      if (lastHash !== null && block.prevHash !== lastHash) {
        broken = true
        setState('chainStatus', 'broken')
        return
      }

      const recomputed = await sha256Hex(block.prevHash + block.timestamp + JSON.stringify(block.payload))
      if (recomputed !== block.hash) {
        broken = true
        setState('chainStatus', 'broken')
        return
      }

      lastHash = block.hash
      setState(
        produce((draft) => {
          draft.blocks.push(block)
          if (draft.blocks.length > MAX_BLOCKS) draft.blocks.shift()
          draft.chainStatus = 'verified'
        }),
      )
    }

    ;(async () => {
      try {
        const res = await fetch(`${window.location.origin}/api/audit/stream`, {
          signal: controller.signal,
        })
        if (!res.body) throw new Error('audit stream: empty response body')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let boundary = buffer.indexOf('\n\n')
          while (boundary !== -1) {
            const { event, data } = parseFrame(buffer.slice(0, boundary))
            buffer = buffer.slice(boundary + 2)
            if (event === 'audit_block') await handleBlock(data as unknown as AuditBlock)
            boundary = buffer.indexOf('\n\n')
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return
        console.error('audit stream error', err)
      } finally {
        if (!controller.signal.aborted) setState('connected', false)
      }
    })()

    return () => controller.abort()
  }

  return { state, connect }
}
