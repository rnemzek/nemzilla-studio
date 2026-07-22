/**
 * Passive event-bus listener: the Artifact Recorder daemon from the UOW-11
 * spec. Reacts to `pipeline_completed` and persists the finished app payload
 * two ways: the UOW-11 session bundle (sessionBundleRecorder.ts, one file
 * per artifact type under `.codex/sessions/[id]/`) and the legacy UOW-09
 * single-file demo record (sessionSerializer.ts) that the Cookbook dropdown
 * still reads from.
 */
import { getSessionAuditBlocks } from './auditLedger.ts'
import { onPipelineEvent, type PipelineEvent } from './eventBus.ts'
import { recordCompletedBuild } from './sessionSerializer.ts'
import { writeAppPayload } from './sessionBundleRecorder.ts'

interface PipelineCompletedData {
  scenario: string
  code: string
  prompt: string
  /**
   * UOW-11 Task 11.6: the classic pipeline's `sessionId` (a fresh
   * builder-lock id per stream connection) IS the right bundle folder for
   * `.codex/demos/[id].json`'s legacy record. But a swarm-mode run's
   * `sessionId` is *also* just a fresh per-connection builder-lock id, while
   * its `po-transcript.json`/`catalog.json`/`policy-rules.json` were already
   * written under the PO interview's own session id (`swarmSessionId` in
   * agentStream.ts). Without this override, `writeAppPayload` would create a
   * brand-new, disconnected `.codex/sessions/[builder-lock-id]/` folder
   * instead of completing the interview's existing bundle. `recordCompletedBuild`/
   * `getSessionAuditBlocks` still use the builder-lock `sessionId` below —
   * that's the id every audit event from *this run* was actually tagged
   * with, regardless of which bundle folder the payload itself belongs in.
   */
  bundleSessionId?: string
}

// Best-effort delay before snapshotting a completed build's own audit
// trail — enqueueAuditEvent() is non-blocking (drained via setImmediate),
// so the pipeline's very last audit events need a beat to land in
// auditLedger's chain before getSessionAuditBlocks() reads it. Filtering by
// sessionId (not an index range) means a later build starting immediately
// afterward can't pollute this snapshot even if the settle delay is generous.
const SERIALIZE_SETTLE_MS = 150

function isPipelineCompletedData(v: unknown): v is PipelineCompletedData {
  if (v === null || typeof v !== 'object') return false
  const d = v as Record<string, unknown>
  return (
    typeof d.scenario === 'string' &&
    typeof d.code === 'string' &&
    typeof d.prompt === 'string' &&
    (d.bundleSessionId === undefined || typeof d.bundleSessionId === 'string')
  )
}

onPipelineEvent((event: PipelineEvent) => {
  if (event.name !== 'pipeline_completed' || !event.sessionId || !isPipelineCompletedData(event.data)) return
  const sessionId = event.sessionId
  const { scenario, code, prompt, bundleSessionId } = event.data

  void writeAppPayload(bundleSessionId ?? sessionId, { scenario, code })

  setTimeout(() => {
    void recordCompletedBuild({ sessionId, scenario, prompt, code, auditBlocks: getSessionAuditBlocks(sessionId) })
  }, SERIALIZE_SETTLE_MS)
})
