import { For, Show, createMemo, createSignal, onMount } from 'solid-js'
import { interviewState } from '../lib/interviewStore.ts'
import { auditStore, AGENT_TRACE_ACTIONS, type AuditBlock } from '../lib/auditStore.ts'
import { sandboxStore } from '../lib/sandboxStore.ts'
import { runHistoryState, saveRun, deleteRun, type SavedRun, type SavedRunCatalog, type SavedRunPolicyRules } from '../lib/runHistoryStore.ts'
import { replayState, startReplay, stopReplay } from '../lib/replayStore.ts'
import { formatAuditLine } from '../lib/auditTrace.ts'
import type { PoTranscriptEntry } from '../lib/poInterview.ts'

type ArtifactTab = 'transcript' | 'inspector' | 'trace' | 'history'

const TABS: Array<{ id: ArtifactTab; label: string }> = [
  { id: 'transcript', label: 'Discovery Transcript' },
  { id: 'inspector', label: 'Prompt & Payload Inspector' },
  { id: 'trace', label: 'Agent Trace' },
  { id: 'history', label: 'Run History' },
]

type AccordionSection = 'system' | 'inputs' | 'json'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false })
}


/**
 * Pass A: the Artifacts / Telemetry deck — a 3rd tab inside AppPreview
 * alongside the existing Preview/Source tabs. Reads two already-live
 * reactive sources rather than opening any new connections of its own:
 * interviewState (terminalCommands.ts's AI PO interview, mirrored via
 * interviewStore.ts) and auditStore (the same singleton AuditLedgerPanel.tsx
 * already keeps connected — see auditStore.ts's doc comment on why this
 * view must never call `.connect()` itself).
 */
export default function ArtifactsPanel() {
  const [tab, setTab] = createSignal<ArtifactTab>('transcript')
  const [openSection, setOpenSection] = createSignal<AccordionSection | null>('json')
  const [systemPrompt, setSystemPrompt] = createSignal<string | null>(null)
  const [viewedRun, setViewedRun] = createSignal<SavedRun | null>(null)
  const [runName, setRunName] = createSignal('')
  const [savedMessage, setSavedMessage] = createSignal<string | null>(null)

  onMount(async () => {
    try {
      const res = await fetch(`${window.location.origin}/api/po/interview/meta`)
      if (!res.ok) return
      const body = (await res.json()) as { systemPrompt?: string }
      if (typeof body.systemPrompt === 'string') setSystemPrompt(body.systemPrompt)
    } catch (err) {
      console.error('ArtifactsPanel: failed to load system prompt', err)
    }
  })

  const transcript = createMemo<PoTranscriptEntry[]>(() => viewedRun()?.transcript ?? interviewState.interview?.transcript ?? [])
  const catalog = createMemo<SavedRunCatalog | null>(() => {
    const run = viewedRun()
    if (run) return run.catalog
    const live = interviewState.interview
    if (!live?.vendorName || !live.catalog) return null
    return { vendorName: live.vendorName, items: live.catalog }
  })
  const policyRules = createMemo<SavedRunPolicyRules | null>(() => {
    const run = viewedRun()
    if (run) return run.policyRules
    const threshold = interviewState.interview?.hitlThreshold
    if (threshold === null || threshold === undefined) return null
    return { hitlThreshold: threshold, autoApproveThreshold: threshold, autoDenyThreshold: 500 }
  })
  const auditBlocks = createMemo<AuditBlock[]>(() => viewedRun()?.auditBlocks ?? auditStore.state.blocks)
  const traceBlocks = createMemo(() => auditBlocks().filter((block) => AGENT_TRACE_ACTIONS.has(block.action)))

  function toggleSection(section: AccordionSection) {
    setOpenSection((current) => (current === section ? null : section))
  }

  async function handleSaveRun() {
    const name = runName().trim() || `Run — ${new Date().toLocaleString()}`
    saveRun({
      name,
      transcript: transcript(),
      catalog: catalog(),
      policyRules: policyRules(),
      auditBlocks: auditBlocks(),
      code: sandboxStore.state.code,
    })
    setRunName('')
    setSavedMessage(`Saved "${name}" to Run History.`)
    setTimeout(() => setSavedMessage(null), 2500)
  }

  /** Replays whatever is currently live (interview + audit trace) without requiring a Save Run first. */
  function handleReplayLive() {
    startReplay({
      id: 'live-session',
      name: 'Current Session (live)',
      createdAt: new Date().toISOString(),
      transcript: transcript(),
      catalog: catalog(),
      policyRules: policyRules(),
      auditBlocks: auditBlocks(),
      code: sandboxStore.state.code,
    })
  }

  return (
    <div class="flex h-full flex-col">
      <div class="flex gap-1 border-b border-border px-2 pt-1">
        <For each={TABS}>
          {(t) => (
            <button
              type="button"
              class={`rounded-t-md px-2 py-1 text-[11px] font-medium transition-colors ${
                tab() === t.id ? 'bg-surface-raised text-text' : 'text-text-muted hover:text-text'
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          )}
        </For>
      </div>

      <Show when={replayState.run}>
        {(run) => (
          <div class="flex items-center justify-between gap-2 border-b border-border bg-accent/10 px-3 py-1.5 text-[11px] text-accent">
            <span>
              ▶ Replaying: <span class="font-medium">{run().name}</span> — see the Swarm panel for the packet trajectory.
            </span>
            <button type="button" class="rounded border border-accent/40 px-2 py-0.5 hover:bg-accent/10" onClick={() => stopReplay()}>
              Exit Replay
            </button>
          </div>
        )}
      </Show>

      <Show when={viewedRun()}>
        {(run) => (
          <div class="flex items-center justify-between gap-2 border-b border-border bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300">
            <span>
              Viewing saved run: <span class="font-medium">{run().name}</span> ({new Date(run().createdAt).toLocaleString()})
            </span>
            <button type="button" class="rounded border border-amber-400/40 px-2 py-0.5 hover:bg-amber-400/10" onClick={() => setViewedRun(null)}>
              Back to Live
            </button>
          </div>
        )}
      </Show>

      <div class="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs">
        <Show when={tab() === 'transcript'}>
          <For each={transcript()} fallback={<p class="text-text-muted">No discovery transcript yet — type "build" in the terminal to start one.</p>}>
            {(entry) => (
              <p class="mb-2 whitespace-pre-wrap">
                <span class={`font-semibold ${entry.role === 'po' ? 'text-accent' : 'text-text'}`}>
                  {entry.role === 'po' ? 'AI PO' : 'You'}:
                </span>{' '}
                <span class="text-text-muted">{entry.message}</span>
              </p>
            )}
          </For>
        </Show>

        <Show when={tab() === 'inspector'}>
          <div class="space-y-2">
            <div class="rounded-md border border-border/60">
              <button
                type="button"
                class="flex w-full items-center justify-between px-2 py-1.5 text-left text-text hover:bg-surface-raised"
                onClick={() => toggleSection('system')}
              >
                <span>System Prompt</span>
                <span class="text-text-muted">{openSection() === 'system' ? '▾' : '▸'}</span>
              </button>
              <Show when={openSection() === 'system'}>
                <pre class="whitespace-pre-wrap border-t border-border/60 bg-bg px-2 py-2 text-[10px] text-text-muted">
                  {systemPrompt() ?? 'Loading...'}
                </pre>
              </Show>
            </div>

            <div class="rounded-md border border-border/60">
              <button
                type="button"
                class="flex w-full items-center justify-between px-2 py-1.5 text-left text-text hover:bg-surface-raised"
                onClick={() => toggleSection('inputs')}
              >
                <span>User Inputs ({transcript().filter((e) => e.role === 'user').length})</span>
                <span class="text-text-muted">{openSection() === 'inputs' ? '▾' : '▸'}</span>
              </button>
              <Show when={openSection() === 'inputs'}>
                <div class="border-t border-border/60 bg-bg px-2 py-2">
                  <For each={transcript().filter((e) => e.role === 'user')} fallback={<p class="text-text-muted">No user turns yet.</p>}>
                    {(entry) => (
                      <p class="mb-1 text-[10px] text-text-muted">
                        <span class="text-text">{formatTime(entry.timestamp)}</span> — {entry.message}
                      </p>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            <div class="rounded-md border border-border/60">
              <button
                type="button"
                class="flex w-full items-center justify-between px-2 py-1.5 text-left text-text hover:bg-surface-raised"
                onClick={() => toggleSection('json')}
              >
                <span>Extracted JSON (catalog, policyRules)</span>
                <span class="text-text-muted">{openSection() === 'json' ? '▾' : '▸'}</span>
              </button>
              <Show when={openSection() === 'json'}>
                <pre class="whitespace-pre-wrap border-t border-border/60 bg-bg px-2 py-2 text-[10px] text-text-muted">
                  {JSON.stringify({ catalog: catalog(), policyRules: policyRules() }, null, 2)}
                </pre>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={tab() === 'trace'}>
          <For each={traceBlocks()} fallback={<p class="text-text-muted">No agent activity recorded yet.</p>}>
            {(block) => (
              <div class="mb-1.5 flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                <span class="text-text-muted">{formatAuditLine(block)}</span>
                <span class="shrink-0 text-text-muted/70">{formatTime(block.timestamp)}</span>
              </div>
            )}
          </For>
        </Show>

        <Show when={tab() === 'history'}>
          <div class="mb-3 flex items-center gap-2 border-b border-border/60 pb-3">
            <input
              type="text"
              value={runName()}
              onInput={(event) => setRunName(event.currentTarget.value)}
              placeholder="Name this run (optional)"
              class="flex-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-text"
            />
            <button
              type="button"
              disabled={sandboxStore.state.status !== 'ready'}
              class="whitespace-nowrap rounded-md bg-emerald-500 px-2 py-1 text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
              onClick={() => void handleSaveRun()}
            >
              📦 Save Run
            </button>
            <button
              type="button"
              disabled={auditBlocks().length === 0}
              class="whitespace-nowrap rounded-md border border-accent/50 px-2 py-1 text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
              onClick={handleReplayLive}
            >
              ▶ Replay Current Run
            </button>
          </div>
          <Show when={savedMessage()}>
            <p class="mb-2 text-emerald-400">{savedMessage()}</p>
          </Show>
          <For each={runHistoryState.runs} fallback={<p class="text-text-muted">No saved runs yet — build something, then Save Run.</p>}>
            {(run) => (
              <div class="mb-2 flex items-center justify-between gap-2 rounded-md border border-border/60 bg-surface-raised px-2 py-1.5">
                <div class="min-w-0">
                  <p class="truncate text-text">{run.name}</p>
                  <p class="text-[10px] text-text-muted">
                    {new Date(run.createdAt).toLocaleString()} · {run.transcript.length} transcript turns · {run.auditBlocks.length} audit blocks
                  </p>
                </div>
                <div class="flex shrink-0 gap-1">
                  <button type="button" class="rounded border border-border px-1.5 py-0.5 hover:bg-surface" onClick={() => setViewedRun(run)}>
                    View
                  </button>
                  <button
                    type="button"
                    disabled={run.auditBlocks.length === 0}
                    class="rounded border border-accent/50 px-1.5 py-0.5 text-accent hover:bg-accent/10 disabled:opacity-50"
                    onClick={() => startReplay(run)}
                  >
                    ▶ Replay
                  </button>
                  <button
                    type="button"
                    class="rounded border border-border px-1.5 py-0.5 hover:bg-surface"
                    onClick={() => sandboxStore.setCode(run.code)}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    class="rounded border border-border px-1.5 py-0.5 text-red-400 hover:bg-surface"
                    onClick={() => {
                      deleteRun(run.id)
                      if (viewedRun()?.id === run.id) setViewedRun(null)
                      if (replayState.run?.id === run.id) stopReplay()
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}
