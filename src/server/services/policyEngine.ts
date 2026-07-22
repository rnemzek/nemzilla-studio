/**
 * The Governance Policy Engine (see .codex/AGENTZ-STUDIO-SDK.md section 6).
 * Two layers: an absolute System Ceiling nothing can override, and
 * User-Defined Policy Bounds that are honored as-is when within the ceiling
 * and clamped back down to it otherwise.
 */

export interface SystemCeiling {
  maxApiCallsPerMinute: number
  /** Absolute order-value ceiling — above this, an order always auto-denies. */
  maxOrderThreshold: number
  /**
   * Ceiling for the user-customizable auto-approve tier. Deliberately lower
   * than `maxOrderThreshold`, not equal to it — clamping a requested
   * auto-approve threshold to the *same* value as the deny ceiling would
   * collapse the HITL band to nothing (e.g. "between $500 and $500").
   */
  maxAutoApproveThreshold: number
  forbiddenOperations: string[]
}

export const SYSTEM_CEILING: SystemCeiling = {
  maxApiCallsPerMinute: 20,
  maxOrderThreshold: 500,
  maxAutoApproveThreshold: 250,
  forbiddenOperations: ['delete_all_orders', 'disable_policy_engine', 'bypass_hitl'],
}

export interface PolicyCheckResult {
  allowed: boolean
  reason?: string
  clamped?: boolean
  value?: number
}

/**
 * Resolves a generated app's auto-approve order threshold. Honors any
 * user-requested value at or under `maxAutoApproveThreshold`; anything above
 * it is clamped back down to that ceiling (not to `maxOrderThreshold` — see
 * the field comment on SystemCeiling for why those two stay distinct).
 * Always "allowed" — clamping is not a denial, just a bound.
 */
export function resolveOrderThreshold(userRequested?: number): PolicyCheckResult {
  const requested =
    typeof userRequested === 'number' && Number.isFinite(userRequested) && userRequested > 0
      ? userRequested
      : 100

  if (requested > SYSTEM_CEILING.maxAutoApproveThreshold) {
    return {
      allowed: true,
      clamped: true,
      value: SYSTEM_CEILING.maxAutoApproveThreshold,
      reason: `Requested auto-approve threshold $${requested} exceeds the $${SYSTEM_CEILING.maxAutoApproveThreshold} auto-approve ceiling — clamped.`,
    }
  }

  return { allowed: true, clamped: false, value: requested }
}

/** Refuses generation prompts that explicitly name a forbidden operation. */
export function checkForbiddenOperation(prompt: string): PolicyCheckResult {
  const normalized = prompt.toLowerCase().replace(/[\s-]+/g, '_')
  const hit = SYSTEM_CEILING.forbiddenOperations.find((op) => normalized.includes(op))
  if (hit) {
    return { allowed: false, reason: `Operation "${hit}" is forbidden by the system ceiling.` }
  }
  return { allowed: true }
}

// Global sliding window — matches the SDK's single-active-session model
// (see AGENTZ-STUDIO-SDK.md's Multi-User & Concurrency Strategy), not per-IP.
const requestTimestamps: number[] = []
const RATE_WINDOW_MS = 60_000

export function checkRateLimit(now: number = Date.now()): PolicyCheckResult {
  while (requestTimestamps.length > 0 && now - requestTimestamps[0]! > RATE_WINDOW_MS) {
    requestTimestamps.shift()
  }
  if (requestTimestamps.length >= SYSTEM_CEILING.maxApiCallsPerMinute) {
    return {
      allowed: false,
      reason: `Rate limit exceeded — max ${SYSTEM_CEILING.maxApiCallsPerMinute} API calls/min.`,
    }
  }
  requestTimestamps.push(now)
  return { allowed: true }
}
