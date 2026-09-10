import { For, Show } from 'solid-js'
import type { ModernizationRisk, RiskSeverity } from '../lib/stackrynIngestClient.ts'

/**
 * UOW-5.0: mobile-first SVG/CSS charts giving a C-level executive an
 * immediate visual read on the Stackryn Cockpit before they scroll into the
 * detailed risk matrix / Linear payload. Purely a presentation layer over
 * data StackrynCockpitPanel.tsx already has (metrics.systemsMapped + risks)
 * — no new server/store fields, per this UOW's file scope.
 */

type ReadinessLabel = 'API-Ready' | 'Adapter Needed' | 'EOL Legacy'

const ADAPTER_PATTERN = /webhook|adapter|\bcdc\b/i
const EOL_PATTERN = /end-of-life|\beol\b|legacy|mainframe|as400/i

const READINESS_ORDER: ReadinessLabel[] = ['API-Ready', 'Adapter Needed', 'EOL Legacy']

const READINESS_BAR_CLASS: Record<ReadinessLabel, string> = {
  'API-Ready': 'bg-emerald-400',
  'Adapter Needed': 'bg-amber-400',
  'EOL Legacy': 'bg-red-400',
}

const READINESS_DOT_CLASS: Record<ReadinessLabel, string> = {
  'API-Ready': 'bg-emerald-400',
  'Adapter Needed': 'bg-amber-400',
  'EOL Legacy': 'bg-red-400',
}

const RISK_STROKE_CLASS: Record<RiskSeverity, string> = {
  CRITICAL: 'stroke-red-400',
  HIGH: 'stroke-orange-400',
  MEDIUM: 'stroke-amber-300',
}

const RISK_DOT_CLASS: Record<RiskSeverity, string> = {
  CRITICAL: 'bg-red-400',
  HIGH: 'bg-orange-400',
  MEDIUM: 'bg-amber-300',
}

/** Classifies each known risk into a readiness bucket by keyword signal in its title/recommendation; unmatched risks (e.g. a SOC2/PII compliance note) don't move a system out of "API-Ready". */
function classifyReadiness(risks: ModernizationRisk[]): Record<ReadinessLabel, number> {
  const counts: Record<ReadinessLabel, number> = { 'API-Ready': 0, 'Adapter Needed': 0, 'EOL Legacy': 0 }
  for (const risk of risks) {
    const haystack = `${risk.title} ${risk.recommendation}`
    if (ADAPTER_PATTERN.test(haystack)) counts['Adapter Needed'] += 1
    else if (EOL_PATTERN.test(haystack)) counts['EOL Legacy'] += 1
  }
  return counts
}

export function SystemReadinessDistribution(props: { systemsMapped: number; risks: ModernizationRisk[] }) {
  const buckets = () => {
    const flagged = classifyReadiness(props.risks)
    const total = Math.max(props.systemsMapped, 1)
    const notReady = Math.min(flagged['Adapter Needed'] + flagged['EOL Legacy'], total)
    flagged['API-Ready'] = total - notReady
    return { flagged, total }
  }

  return (
    <div class="rounded-md border border-border bg-surface-raised p-2" data-testid="stackryn-readiness-distribution">
      <p class="uppercase tracking-wide text-text-muted">System Integration Readiness</p>
      <div class="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-surface" role="img" aria-label="System integration readiness distribution">
        <For each={READINESS_ORDER}>
          {(label) => {
            const count = () => buckets().flagged[label]
            const pct = () => (count() / buckets().total) * 100
            return (
              <Show when={count() > 0}>
                <div class={READINESS_BAR_CLASS[label]} style={{ width: `${pct()}%` }} title={`${label}: ${count()}`} />
              </Show>
            )
          }}
        </For>
      </div>
      <ul class="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        <For each={READINESS_ORDER}>
          {(label) => (
            <li class="flex items-center gap-1.5 text-text-muted">
              <span class={`h-2 w-2 shrink-0 rounded-full ${READINESS_DOT_CLASS[label]}`} />
              {label} · {buckets().flagged[label]}
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}

export function RiskSeverityBreakdown(props: { risks: ModernizationRisk[] }) {
  const severities: RiskSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM']

  const counts = () => {
    const tally: Record<RiskSeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 }
    for (const risk of props.risks) tally[risk.severity] += 1
    return tally
  }
  const total = () => Math.max(props.risks.length, 1)

  const segments = () => {
    let offset = 0
    return severities.map((severity) => {
      const count = counts()[severity]
      const pct = (count / total()) * 100
      const segment = { severity, count, pct, offset }
      offset += pct
      return segment
    })
  }

  const CIRCUMFERENCE = 100
  const RADIUS = 15.9155

  return (
    <div
      class="flex flex-col items-center gap-3 rounded-md border border-border bg-surface-raised p-2 sm:flex-row"
      data-testid="stackryn-risk-severity-donut"
    >
      <svg viewBox="0 0 36 36" class="h-20 w-20 shrink-0" role="img" aria-label="Risk severity breakdown">
        <circle cx="18" cy="18" r={RADIUS} fill="none" class="stroke-surface" stroke-width="4" />
        <For each={segments()}>
          {(segment) => (
            <Show when={segment.count > 0}>
              <circle
                cx="18"
                cy="18"
                r={RADIUS}
                fill="none"
                class={RISK_STROKE_CLASS[segment.severity]}
                stroke-width="4"
                stroke-linecap="round"
                stroke-dasharray={`${segment.pct} ${CIRCUMFERENCE - segment.pct}`}
                stroke-dashoffset={`${25 - segment.offset}`}
              />
            </Show>
          )}
        </For>
        <text x="18" y="19" text-anchor="middle" class="fill-text" style={{ font: '600 7px sans-serif' }}>
          {props.risks.length}
        </text>
      </svg>
      <div class="w-full">
        <p class="uppercase tracking-wide text-text-muted">Risk Severity Breakdown</p>
        <ul class="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <For each={severities}>
            {(severity) => (
              <li class="flex items-center gap-1.5 text-text-muted">
                <span class={`h-2 w-2 shrink-0 rounded-full ${RISK_DOT_CLASS[severity]}`} />
                {severity} · {counts()[severity]}
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  )
}
