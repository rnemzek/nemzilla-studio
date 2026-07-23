import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { adminDrawerOpen, closeAdminDrawer, toggleAdminDrawer } from '../lib/adminDrawerStore.ts'
import { listAdminSessions, getAdminSessionDetail, type AdminVisitorSession, type AdminSessionDetail } from '../lib/adminClient.ts'
import { formatAuditLine } from '../lib/auditTrace.ts'

const MILESTONE_BADGE: Record<string, string> = {
  'PO Interview': 'border-accent/40 text-accent',
  'Swarm Executed': 'border-emerald-500/40 text-emerald-400',
  'Feedback Submitted': 'border-amber-500/40 text-amber-300',
}

const HIRE_LABEL: Record<string, string> = { yes: '✅ Yes', needs_work: '🛠️ Needs Work' }

function formatDuration(startIso: string, endIso: string): string {
  const ms = Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime())
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { hour12: false })
}

/**
 * Pass C Task 3: the Admin Usage & Session Drawer — a right-side slide-out
 * (CommandCenterDrawer.tsx's pattern, mirrored to the opposite side) showing
 * every tracked visitor session (list view) and, per visitor, their complete
 * correlated audit trail plus any feedback they submitted (detail view).
 * Reachable only via terminalCommands.ts's `admin`/`sessions` CLI commands or
 * Ctrl+Alt+A here — never linked from visible nav, per the ask's "hidden
 * shortcut/toggle" framing.
 */
export default function AdminDrawer() {
  const [sessions, setSessions] = createSignal<AdminVisitorSession[]>([])
  const [detail, setDetail] = createSignal<AdminSessionDetail | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  async function loadSessions() {
    setLoading(true)
    setError(null)
    try {
      setSessions(await listAdminSessions())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function openDetail(visitorId: string) {
    setLoading(true)
    setError(null)
    try {
      setDetail(await getAdminSessionDetail(visitorId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  createEffect(() => {
    if (adminDrawerOpen()) {
      setDetail(null)
      void loadSessions()
    }
  })

  onMount(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        toggleAdminDrawer()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    onCleanup(() => window.removeEventListener('keydown', onKeyDown))
  })

  return (
    <>
      <div
        class={`fixed inset-0 z-30 bg-black/60 transition-opacity ${
          adminDrawerOpen() ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={closeAdminDrawer}
      />

      <aside
        data-testid="admin-drawer"
        class={`fixed inset-y-0 right-0 z-40 w-full max-w-lg overflow-y-auto border-l border-border bg-surface p-5 shadow-2xl transition-transform duration-300 ${
          adminDrawerOpen() ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-text-muted">Usage & Session Drawer</h2>
          <button type="button" class="text-text-muted hover:text-text" onClick={closeAdminDrawer}>
            ✕
          </button>
        </div>

        <Show when={error()}>
          <p class="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-300">{error()}</p>
        </Show>

        <Show
          when={detail()}
          fallback={
            <div>
              <div class="mb-3 flex items-center justify-between">
                <p class="text-xs text-text-muted">{sessions().length} tracked visitor(s)</p>
                <button
                  type="button"
                  class="rounded border border-border px-2 py-0.5 text-xs hover:bg-surface-raised"
                  onClick={() => void loadSessions()}
                >
                  {loading() ? 'Refreshing…' : '↻ Refresh'}
                </button>
              </div>

              <div class="space-y-2">
                <For each={sessions()} fallback={<p class="text-xs text-text-muted">No visitor activity tracked yet.</p>}>
                  {(session) => (
                    <button
                      type="button"
                      class="w-full rounded-md border border-border/60 bg-surface-raised p-3 text-left transition-colors hover:border-accent"
                      onClick={() => void openDetail(session.visitorId)}
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span class="font-medium text-text">{session.handle}</span>
                        <span class="shrink-0 text-[10px] text-text-muted">{formatTime(session.lastSeen)}</span>
                      </div>
                      <p class="mt-0.5 text-[10px] text-text-muted">
                        active {formatDuration(session.firstSeen, session.lastSeen)} · {session.pipelineSessionIds.length} pipeline session(s)
                      </p>
                      <div class="mt-1.5 flex flex-wrap gap-1">
                        <For each={session.milestones}>
                          {(milestone) => (
                            <span class={`rounded-full border px-1.5 py-0.5 text-[9px] ${MILESTONE_BADGE[milestone] ?? 'border-border text-text-muted'}`}>
                              {milestone}
                            </span>
                          )}
                        </For>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </div>
          }
        >
          {(d) => (
            <div>
              <button type="button" class="mb-3 text-xs text-accent hover:underline" onClick={() => setDetail(null)}>
                ← Back to list
              </button>

              <div class="mb-4 rounded-md border border-border/60 bg-surface-raised p-3">
                <p class="font-medium text-text">{d().visitor.handle}</p>
                <p class="text-[10px] text-text-muted">
                  {d().visitor.visitorId} · first seen {formatTime(d().visitor.firstSeen)} · last seen {formatTime(d().visitor.lastSeen)}
                </p>
                <div class="mt-1.5 flex flex-wrap gap-1">
                  <For each={d().visitor.milestones}>
                    {(milestone) => (
                      <span class={`rounded-full border px-1.5 py-0.5 text-[9px] ${MILESTONE_BADGE[milestone] ?? 'border-border text-text-muted'}`}>
                        {milestone}
                      </span>
                    )}
                  </For>
                </div>
              </div>

              <Show when={d().feedback.length > 0}>
                <div class="mb-4">
                  <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Feedback</h3>
                  <For each={d().feedback}>
                    {(entry) => (
                      <div class="mb-2 rounded-md border border-border/60 bg-surface-raised p-2 text-xs">
                        <div class="flex items-center justify-between">
                          <span class="text-text-muted">{formatTime(entry.timestamp)}</span>
                          <Show when={entry.wouldHire}>
                            {(hire) => <span class="font-medium">{HIRE_LABEL[hire()]}</span>}
                          </Show>
                        </div>
                        <Show when={entry.comment}>
                          <p class="mt-1 text-text">{entry.comment}</p>
                        </Show>
                        <Show when={entry.advice}>
                          <p class="mt-1 text-text-muted italic">"{entry.advice}"</p>
                        </Show>
                        <Show when={entry.githubIssueUrl}>
                          {(url) => (
                            <a href={url()} target="_blank" rel="noopener noreferrer" class="mt-1 inline-block text-accent hover:underline">
                              View GitHub Issue ↗
                            </a>
                          )}
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <div>
                <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Audit Trail ({d().auditBlocks.length} step{d().auditBlocks.length === 1 ? '' : 's'})
                </h3>
                <For
                  each={d().auditBlocks}
                  fallback={<p class="text-xs text-text-muted">No pipeline activity recorded for this visitor yet.</p>}
                >
                  {(block) => (
                    <div class="mb-1.5 flex items-start justify-between gap-2 border-b border-border/40 pb-1.5 text-xs">
                      <span class="text-text-muted">{formatAuditLine(block)}</span>
                      <span class="shrink-0 text-[10px] text-text-muted/70">{formatTime(block.timestamp)}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </Show>
      </aside>
    </>
  )
}
