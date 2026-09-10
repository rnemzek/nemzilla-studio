import { Show, For, createSignal, createEffect } from 'solid-js'
import { stackrynDashboardState } from '../lib/stackrynDashboardStore.ts'
import type { RiskSeverity } from '../lib/stackrynIngestClient.ts'
import PanelHelpButton from './PanelHelpButton.tsx'
import FloatingShell from './FloatingShell.tsx'
import FileUploadZone from './FileUploadZone.tsx'
import { SystemReadinessDistribution, RiskSeverityBreakdown } from './StackrynReadinessCharts.tsx'
import { openFloat } from '../lib/floatingWindowStore.ts'

const FLOAT_ID = 'stackryn-cockpit'

const RISK_BADGE_CLASS: Record<RiskSeverity, string> = {
  CRITICAL: 'bg-red-500/10 text-red-400 border-red-400/40',
  HIGH: 'bg-orange-500/10 text-orange-400 border-orange-400/40',
  MEDIUM: 'bg-amber-500/10 text-amber-300 border-amber-400/40',
}

function formatUsd(value: number): string {
  return `$${(value / 1000).toFixed(0)}k`
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…`
}

/**
 * UOW-3.0: "Stackryn Modernization Cockpit" — renders the
 * ModernizationDashboardPayload most recently produced by
 * POST /api/stackryn/ingest (see stackrynDashboardStore.ts, populated by
 * CookbookDropdown.tsx's trigger buttons). A standalone floating panel
 * (matching SwarmCanvas/AuditLedgerPanel's own pattern) rather than embedded
 * inside AppPreview.tsx — that component's iframe is a sandboxed,
 * postMessage-driven document.write() target for *generated app* HTML, a
 * fundamentally different rendering pipeline from a normal reactive
 * dashboard with a native clipboard button. See ARCHITECT_JOURNAL.md.
 */
export default function StackrynCockpitPanel() {
  const [copied, setCopied] = createSignal(false)
  let sectionRef: HTMLElement | undefined

  // UOW-4.0: focuses the Product Owner's attention on this panel the moment
  // an ingest pipeline lands a result, instead of leaving them to scroll for
  // it manually in the Command Center grid.
  createEffect(() => {
    if (stackrynDashboardState.latest) {
      sectionRef?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  })

  async function copyLinearPayload() {
    const linearExport = stackrynDashboardState.latest?.result.linearExport
    if (!linearExport) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(linearExport, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('StackrynCockpitPanel: failed to copy Linear payload', err)
    }
  }

  return (
    <FloatingShell id={FLOAT_ID} title="Stackryn Modernization Cockpit" defaultWidth={480}>
      <section
        ref={sectionRef}
        data-testid="stackryn-cockpit-panel"
        class="flex w-full max-w-2xl flex-col rounded-lg border border-border bg-surface text-left shadow-lg"
      >
        <div class="flex items-center justify-between border-b border-border px-4 py-2">
          <span class="text-xs uppercase tracking-wide text-text-muted">Stackryn Modernization Cockpit</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              title="Detach / Float Window"
              class="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] text-text-muted transition-colors hover:border-accent hover:text-accent"
              onClick={() => openFloat(FLOAT_ID, 480)}
            >
              ⤢
            </button>
            <PanelHelpButton title="Stackryn Modernization Cockpit">
              <p>
                Trigger an ingest from the "Stackryn: Project Horizon Cockpit" section of the Preset
                Cookbook (header, top right) to populate this dashboard with scope metrics, an
                automated risk matrix, and a Linear-ready backlog export.
              </p>
            </PanelHelpButton>
          </div>
        </div>

        <div class="space-y-3 p-4">
          <FileUploadZone />
          <Show
            when={stackrynDashboardState.latest}
            fallback={
              <p class="text-xs text-text-muted" data-testid="stackryn-cockpit-empty">
                {stackrynDashboardState.loadingPresetId ? 'Ingesting…' : 'No Stackryn ingest yet — trigger one from the Preset Cookbook.'}
              </p>
            }
          >
            {(response) => {
              const result = () => response().result
              return (
                <Show
                  when={result().policyStatus === 'allowed'}
                  fallback={
                    <p class="text-xs text-red-400" data-testid="stackryn-cockpit-denied">
                      ✗ Ingest denied: {result().reason ?? result().policyStatus}
                    </p>
                  }
                >
                  <div class="space-y-4 text-xs">
                    {/* Scope & Metrics Header */}
                    <div>
                      <h3 class="text-sm font-semibold text-text">{result().projectName}</h3>
                      <p class="text-text-muted">{result().projectId}</p>
                      <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div class="rounded-md border border-border bg-surface-raised p-2">
                          <p class="text-text-muted">Budget</p>
                          <p class="font-medium text-text">
                            {formatUsd(result().metrics!.estimatedCostRangeUsd.min)}–{formatUsd(result().metrics!.estimatedCostRangeUsd.max)}
                          </p>
                        </div>
                        <div class="rounded-md border border-border bg-surface-raised p-2">
                          <p class="text-text-muted">Timeline</p>
                          <p class="font-medium text-text">
                            {result().metrics!.estimatedDurationWeeks.min}–{result().metrics!.estimatedDurationWeeks.max}w
                          </p>
                        </div>
                        <div class="rounded-md border border-border bg-surface-raised p-2">
                          <p class="text-text-muted">Fit Score</p>
                          <p class="font-medium text-emerald-400">{result().metrics!.fitScorePercentage}%</p>
                        </div>
                        <div class="rounded-md border border-border bg-surface-raised p-2">
                          <p class="text-text-muted">Systems Mapped</p>
                          <p class="font-medium text-text">{result().metrics!.systemsMapped}</p>
                        </div>
                      </div>
                    </div>

                    {/* Executive Charts: readiness distribution + risk severity, ahead of the detailed matrix/backlog below */}
                    <div class="space-y-2">
                      <SystemReadinessDistribution systemsMapped={result().metrics!.systemsMapped} risks={result().risks ?? []} />
                      <RiskSeverityBreakdown risks={result().risks ?? []} />
                    </div>

                    {/* Automated Risk Matrix */}
                    <div>
                      <p class="mb-1 uppercase tracking-wide text-text-muted">Automated Risk Matrix</p>
                      <div class="space-y-1.5" data-testid="stackryn-risk-matrix">
                        <For each={result().risks}>
                          {(risk) => (
                            <div class={`rounded-md border px-2 py-1.5 ${RISK_BADGE_CLASS[risk.severity]}`}>
                              <div class="flex items-center gap-2">
                                <span class="rounded border border-current px-1 py-0.5 text-[10px] font-semibold">{risk.severity}</span>
                                <span class="font-medium text-text">{risk.title}</span>
                              </div>
                              <p class="mt-0.5 text-text-muted">{risk.recommendation}</p>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>

                    {/* Linear Backlog Export Card */}
                    <div class="rounded-md border border-border bg-surface-raised p-2" data-testid="stackryn-linear-export">
                      <div class="flex items-center justify-between gap-2">
                        <p class="font-medium text-text">{result().linearExport!.project}</p>
                        <button
                          type="button"
                          class="whitespace-nowrap rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] text-text-muted transition-colors hover:border-accent hover:text-text"
                          onClick={() => void copyLinearPayload()}
                        >
                          {copied() ? '✅ Copied!' : '📋 Copy Linear Payload / JSON'}
                        </button>
                      </div>
                      <p class="mt-1 text-text-muted">
                        {result().linearExport!.epics.length} epic(s) · {result().linearExport!.issues.length} issue(s)
                      </p>
                      <ul class="mt-1 list-inside list-disc text-text-muted">
                        <For each={result().linearExport!.epics}>{(epic) => <li>{epic}</li>}</For>
                      </ul>
                      <Show when={response().auditHash}>
                        {(hash) => (
                          <p class="mt-2 inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400" data-testid="stackryn-audit-signed-tag">
                            ✓ Audit-signed · SHA-256 {shortHash(hash())}
                          </p>
                        )}
                      </Show>
                    </div>
                  </div>
                </Show>
              )
            }}
          </Show>
        </div>
      </section>
    </FloatingShell>
  )
}
