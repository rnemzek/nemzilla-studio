import { For, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { auditStore, type ChainStatus, type PolicyStatus } from '../lib/auditStore.ts'
import { copyDebugArtifacts } from '../lib/artifactExport.ts'
import PanelHelpButton from './PanelHelpButton.tsx'

const CHAIN_STATUS_LABEL: Record<ChainStatus, string> = {
  pending: 'verifying…',
  verified: 'Verified Valid',
  broken: 'Chain Broken',
}

const CHAIN_STATUS_CLASS: Record<ChainStatus, string> = {
  pending: 'text-text-muted',
  verified: 'text-emerald-400',
  broken: 'text-red-400',
}

const POLICY_BADGE_CLASS: Record<PolicyStatus, string> = {
  allowed: 'bg-emerald-500/10 text-emerald-400',
  clamped: 'bg-amber-500/10 text-amber-300',
  denied: 'bg-red-500/10 text-red-400',
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false })
}

export default function AuditLedgerPanel() {
  const audit = auditStore
  let scrollRef: HTMLDivElement | undefined
  const [copied, setCopied] = createSignal(false)

  onMount(() => {
    const disconnect = audit.connect()
    onCleanup(disconnect)
  })

  async function handleCopyArtifacts() {
    const ok = await copyDebugArtifacts()
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  createEffect(() => {
    audit.state.blocks.length
    if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight
  })

  return (
    <section
      data-testid="audit-ledger-panel"
      class="flex w-full max-w-2xl flex-col rounded-lg border border-border bg-surface text-left shadow-lg"
    >
      <div class="flex items-center justify-between border-b border-border px-4 py-2">
        <span class="text-xs uppercase tracking-wide text-text-muted">Audit Ledger</span>
        <div class="flex items-center gap-2">
          <span class={`font-mono text-xs ${CHAIN_STATUS_CLASS[audit.state.chainStatus]}`}>
            {CHAIN_STATUS_LABEL[audit.state.chainStatus]}
          </span>
          <button
            type="button"
            title="Copy PO hand-off state, recent audit entries, and swarm session metadata as Markdown"
            class="whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-0.5 text-[11px] text-text-muted transition-colors hover:border-accent hover:text-text"
            onClick={() => void handleCopyArtifacts()}
          >
            {copied() ? '✅ Copied!' : '📋 Copy Debug Artifacts'}
          </button>
          <PanelHelpButton title="Audit Ledger">
            <p>
              The governance trail — every agent step, policy check, and generated payload is logged
              here as an immutable, hash-chained record, verified as it grows.
            </p>
            <p class="mt-1.5">
              Scroll to see the full history in order, and check the status badge above for the
              chain's overall verification state.
            </p>
          </PanelHelpButton>
        </div>
      </div>

      <div ref={scrollRef} class="h-80 overflow-y-auto px-4 py-3 font-mono text-xs">
        <For
          each={audit.state.blocks}
          fallback={<p class="text-text-muted">Waiting for audit events…</p>}
        >
          {(block) => (
            <div class="mb-2 rounded-md border border-border/60 bg-surface-raised px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <span class="text-text-muted">
                  #{block.index} <span class="text-text">{shortHash(block.hash)}</span>
                </span>
                <span class={`rounded px-1.5 py-0.5 ${POLICY_BADGE_CLASS[block.policyStatus]}`}>
                  {block.policyStatus}
                </span>
              </div>
              <div class="mt-1 flex items-center justify-between gap-2 text-text-muted">
                <span class="text-text">{block.action}</span>
                <span>{formatTime(block.timestamp)}</span>
              </div>
              <pre class="mt-1 truncate text-text-muted">{JSON.stringify(block.payload)}</pre>
            </div>
          )}
        </For>
      </div>
    </section>
  )
}
