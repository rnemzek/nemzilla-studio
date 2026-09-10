/**
 * UOW-1.0: Stackryn scoping requests are governed by the same System Ceiling
 * as every other agent-driven action (see policyEngine.ts) — this is not a
 * separate rule set, just this feature's evaluation of the existing one.
 */

import type { PolicyStatus } from './auditLedger.ts'
import { checkForbiddenOperation, checkRateLimit } from './policyEngine.ts'
import type { ParsedIngestPayload } from './stackrynFormatParsers.ts'

export interface IngestedScopePayload {
  filename: string
  format: ParsedIngestPayload['format']
  recordCount: number
  fields: string[]
  policyStatus: PolicyStatus
  reason?: string
}

export function evaluateGovernance(parsed: ParsedIngestPayload): IngestedScopePayload {
  const base = { filename: parsed.filename, format: parsed.format, recordCount: parsed.recordCount, fields: parsed.fields }

  const rateLimit = checkRateLimit()
  if (!rateLimit.allowed) {
    return { ...base, policyStatus: 'denied', reason: rateLimit.reason }
  }

  const forbidden = checkForbiddenOperation(parsed.excerpt)
  if (!forbidden.allowed) {
    return { ...base, policyStatus: 'denied', reason: forbidden.reason }
  }

  return { ...base, policyStatus: 'allowed' }
}
