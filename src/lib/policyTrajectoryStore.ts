import { createStore } from 'solid-js/store'

export interface PolicyTrajectoryState {
  active: boolean
  /** 0 = Cart Submitted, 1 = Policy Checked, 2 = Audit Ledger Signed. */
  stage: 0 | 1 | 2
  total: number
  decision: string
}

export const TRAJECTORY_STAGES = ['Cart Submitted', 'Policy Checked', 'Audit Ledger Signed'] as const

const DECISION_LABEL: Record<string, string> = {
  auto_approved: 'Auto-Approved',
  hitl_pending: 'HITL Review Pending',
  hitl_approved: 'HITL Approved',
  hitl_denied: 'HITL Denied',
  auto_denied: 'Auto-Denied',
}

export function decisionLabel(decision: string): string {
  return DECISION_LABEL[decision] ?? decision
}

const [state, setState] = createStore<PolicyTrajectoryState>({ active: false, stage: 0, total: 0, decision: '' })

/** Reactive — AppPreview.tsx renders this as a brief governance trajectory bar. */
export const policyTrajectoryState = state

let stageTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers(): void {
  if (stageTimer !== null) clearTimeout(stageTimer)
  if (hideTimer !== null) clearTimeout(hideTimer)
  stageTimer = null
  hideTimer = null
}

/**
 * Pass B Task 4: whenever a synthesized preview app reports an order
 * decision (see sandboxStore.ts's onMessage -> SANDBOX_MESSAGE.order), this
 * drives a brief 3-stage animated trajectory so governance reads as
 * something the user watches happen, not just ledger rows they'd have to go
 * find in the Audit panel.
 */
export function playOrderTrajectory(total: number, decision: string): void {
  clearTimers()
  setState({ active: true, stage: 0, total, decision })
  stageTimer = setTimeout(() => {
    setState('stage', 1)
    stageTimer = setTimeout(() => {
      setState('stage', 2)
      hideTimer = setTimeout(() => setState('active', false), 1800)
    }, 700)
  }, 500)
}
