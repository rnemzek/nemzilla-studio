import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { generateAppSnippet } from '../prompts/appGeneratorPrompt.ts'
import { checkForbiddenOperation, checkRateLimit, resolveOrderThreshold, SYSTEM_CEILING } from './policyEngine.ts'
import { emitPipelineEvent, type PipelineEvent } from './eventBus.ts'
import { isValidSessionId, readSessionBundle } from './sessionBundleRecorder.ts'
import { isValidVisitorId, sanitizeHandle, touchVisitor, linkPipelineSession, addMilestone } from './visitorTracker.ts'
import { sendHighValueAlert } from './webhookNotifier.ts'
import { dispatchDomainAgents, type DomainAgentResult } from './domainAgents.ts'
import { synthesizeOrderEntryApp, type SwarmCatalogItem } from './swarmCodeSynthesizer.ts'
import {
  claimSession,
  endSession,
  getBacklog,
  isAborted,
  requestAbort,
  subscribe,
  type SessionFrame,
  type SessionRole,
} from './sessionManager.ts'

type AgentName = 'Planner' | 'Architect' | 'Lead Dev' | 'Reviewer'

interface PipelineStage {
  agent: AgentName
  thought: string
}

const PIPELINE: PipelineStage[] = [
  {
    agent: 'Planner',
    thought: 'Breaking the request into a task graph and identifying dependencies.',
  },
  {
    agent: 'Architect',
    thought: 'Selecting module boundaries and defining data flow between services.',
  },
  {
    agent: 'Lead Dev',
    thought: 'Drafting the implementation across the affected files.',
  },
  {
    agent: 'Reviewer',
    thought: 'Checking correctness, edge cases, and test coverage before sign-off.',
  },
]

const TOKEN_DELAY_MS = 40
const STAGE_GAP_MS = 150
const CODE_CHUNK_SIZE = 24
const CODE_CHUNK_DELAY_MS = 8

/**
 * UOW-11 Task 11.4/11.5: the conversational-build counterpart to `PIPELINE`
 * above. `[Domain Micro-Agents]` (Task 11.5) is now a real, variable-length
 * sub-sequence — `dispatchDomainAgents()` in `domainAgents.ts` decides which
 * agents actually run based on the interview's catalog/vendor content, so a
 * plain retail interview dispatches just AI Vendor + AI OE while one
 * mentioning recipes/sports/movies/tasks pulls in the matching extra agent(s).
 * `Lead Dev` here is still reasoning-only (no generated_app_payload yet) —
 * actual code synthesis from the dispatched agents' schemas is Task 11.6's
 * Andiamo launch, not this one.
 */
interface SwarmContext {
  vendorName: string
  itemCount: number
  hitlThreshold: number
}

const SWARM_THOUGHTS = {
  po: (ctx: SwarmContext) =>
    `Reviewing the discovery interview for ${ctx.vendorName} — ${ctx.itemCount} catalog item(s), a $${ctx.hitlThreshold} HITL threshold requested.`,
  architect: (ctx: SwarmContext) => `Compiling the blueprint: state machine, UI tree, and policy boundary model for ${ctx.vendorName}.`,
  policy: () =>
    `Evaluating governance bounds against the $${SYSTEM_CEILING.maxAutoApproveThreshold} auto-approve ceiling and $${SYSTEM_CEILING.maxOrderThreshold} auto-deny boundary.`,
  leadDev: (ctx: SwarmContext, dispatched: DomainAgentResult[]) =>
    `Preparing code synthesis and assembly for ${ctx.vendorName}'s generated application using outputs from ${dispatched.map((d) => d.agent).join(', ')}.`,
}

// Longer/more deliberate than the classic pipeline's timing — this run is
// meant to be watched on the Swarm Canvas during a conversational demo, so
// hand-offs need to read as distinct beats rather than blur together (see
// the UOW-11 vision doc's Phase B: "artificial telemetry delays for
// scannability").
const SWARM_TOKEN_DELAY_MS = 45
const SWARM_STAGE_GAP_MS = 650
const SWARM_HANDOFF_GAP_MS = 350

function heapMb() {
  return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10
}

function chunkString(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Runs one EXECUTING -> token-stream -> [onTokensDone] -> metric_tick -> DONE
 * beat of the swarm pipeline for a single agent (a named stage like PO/
 * Architect, or one dynamically-dispatched domain agent). Factored out so
 * `dispatchDomainAgents()`'s variable-length agent list and the fixed named
 * stages share one implementation rather than duplicating the beat three
 * times. Returns false the instant the run is aborted, so callers can bail
 * immediately without re-checking `isAborted()` themselves.
 */
async function runSwarmStage(
  emit: (event: Omit<PipelineEvent, 'sessionId'>) => void,
  sessionId: string,
  agent: string,
  thought: string,
  options?: { auditPayload?: Record<string, unknown>; onTokensDone?: () => void | Promise<void> },
): Promise<boolean> {
  if (isAborted(sessionId)) return false
  const startedAt = Date.now()
  const auditExtra = options?.auditPayload ?? {}

  emit({
    name: 'agent_step',
    broadcast: { agent, state: 'EXECUTING', timestamp: new Date().toISOString() },
    audit: { payload: { agent, state: 'EXECUTING', ...auditExtra } },
  })

  for (const word of thought.split(' ')) {
    if (isAborted(sessionId)) return false
    emit({ name: 'token_stream', broadcast: { agent, token: `${word} ` } })
    await sleep(SWARM_TOKEN_DELAY_MS)
  }

  if (isAborted(sessionId)) return false
  await options?.onTokensDone?.()
  if (isAborted(sessionId)) return false

  emit({
    name: 'metric_tick',
    broadcast: { agent, latencyMs: Date.now() - startedAt, memoryMb: heapMb(), timestamp: new Date().toISOString() },
  })
  emit({
    name: 'agent_step',
    broadcast: { agent, state: 'DONE', timestamp: new Date().toISOString() },
    audit: { payload: { agent, state: 'DONE', ...auditExtra } },
  })

  return true
}

async function swarmHandoff(emit: (event: Omit<PipelineEvent, 'sessionId'>) => void, from: string, to: string): Promise<void> {
  emit({
    name: 'system_alert',
    broadcast: { level: 'info', message: `Handing off from ${from} to ${to}...`, timestamp: new Date().toISOString() },
  })
  await sleep(SWARM_HANDOFF_GAP_MS)
}

/**
 * The actual pipeline simulation — runs exactly once per active build,
 * broadcast to every subscriber (builder + spectators alike) via
 * sessionManager rather than writing to any one specific HTTP stream.
 */
async function runPipeline(sessionId: string, prompt?: string): Promise<void> {
  const emit = (event: Omit<PipelineEvent, 'sessionId'>) => emitPipelineEvent({ ...event, sessionId })
  let generatedApp: { scenario: string; code: string } | null = null

  emit({
    name: 'system_alert',
    broadcast: { level: 'info', message: 'connected to agent stream', timestamp: new Date().toISOString() },
  })

  const forbidden = prompt ? checkForbiddenOperation(prompt) : { allowed: true }
  if (prompt && !forbidden.allowed) {
    emit({ name: 'generation_request', audit: { payload: { prompt, reason: forbidden.reason }, policyStatus: 'denied' } })
    emit({
      name: 'system_alert',
      broadcast: { level: 'error', message: `Generation refused: ${forbidden.reason}`, timestamp: new Date().toISOString() },
      notify: { type: 'error', message: `Generation refused: ${forbidden.reason}` },
    })
  }

  for (const { agent, thought } of PIPELINE) {
    if (isAborted(sessionId)) return
    const startedAt = Date.now()

    emit({
      name: 'agent_step',
      broadcast: { agent, state: 'EXECUTING', timestamp: new Date().toISOString() },
      audit: { payload: { agent, state: 'EXECUTING' } },
    })

    for (const word of thought.split(' ')) {
      if (isAborted(sessionId)) return
      emit({ name: 'token_stream', broadcast: { agent, token: `${word} ` } })
      await sleep(TOKEN_DELAY_MS)
    }

    if (isAborted(sessionId)) return

    if (agent === 'Lead Dev' && prompt && forbidden.allowed) {
      const { scenario, code, policyCheck } = generateAppSnippet(prompt, sessionId)
      if (policyCheck) {
        const policyEvent: Omit<PipelineEvent, 'sessionId'> = {
          name: 'policy_check',
          audit: {
            payload: { type: 'order_threshold', scenario, ...policyCheck },
            policyStatus: policyCheck.clamped ? 'clamped' : 'allowed',
          },
        }
        if (policyCheck.clamped) {
          policyEvent.notify = { type: 'warning', message: policyCheck.reason ?? 'Policy value clamped.' }
        }
        emit(policyEvent)
      }
      for (const chunk of chunkString(code, CODE_CHUNK_SIZE)) {
        if (isAborted(sessionId)) return
        emit({ name: 'generated_app_payload', broadcast: { scenario, code: chunk, done: false } })
        await sleep(CODE_CHUNK_DELAY_MS)
      }
      if (isAborted(sessionId)) return
      emit({
        name: 'generated_app_payload',
        broadcast: { scenario, code, done: true },
        audit: { payload: { scenario, size: code.length } },
      })
      generatedApp = { scenario, code }
    }

    if (isAborted(sessionId)) return

    emit({
      name: 'metric_tick',
      broadcast: { agent, latencyMs: Date.now() - startedAt, memoryMb: heapMb(), timestamp: new Date().toISOString() },
    })
    emit({
      name: 'agent_step',
      broadcast: { agent, state: 'DONE', timestamp: new Date().toISOString() },
      audit: { payload: { agent, state: 'DONE' } },
    })

    await sleep(STAGE_GAP_MS)
  }

  if (isAborted(sessionId)) return

  emit({
    name: 'system_alert',
    broadcast: { level: 'info', message: 'pipeline complete', timestamp: new Date().toISOString() },
  })

  if (generatedApp && prompt) {
    const { scenario, code } = generatedApp
    emit({
      name: 'pipeline_completed',
      data: { scenario, code, prompt },
      notify: { type: 'success', message: `Build complete — ${scenario}` },
    })
  }
}

/**
 * The conversational-build swarm telemetry run (Task 11.4). Reads back the
 * completed PO interview bundle (Task 11.1/11.3) by `swarmSessionId` and
 * walks the `[PO] -> [Architect] -> [Domain Micro-Agents] -> [Policy] ->
 * [Lead Dev]` stage list, emitting the exact same tagged PipelineEvent shape
 * `runPipeline()` does — so the event bus's existing daemons (broadcast
 * relay, audit, notifier, artifact recorder) all pick this run up with zero
 * changes of their own, satisfying "broadcast to the Event Bus" for free.
 */
async function runSwarmPipeline(sessionId: string, swarmSessionId: string): Promise<void> {
  const emit = (event: Omit<PipelineEvent, 'sessionId'>) => emitPipelineEvent({ ...event, sessionId })

  const bundle = await readSessionBundle(swarmSessionId)
  const catalog = bundle?.catalog as { vendorName: string; items: unknown[] } | null | undefined
  const policyRules = bundle?.policyRules as { hitlThreshold: number } | null | undefined

  if (!catalog || !policyRules) {
    emit({
      name: 'system_alert',
      broadcast: {
        level: 'error',
        message: `No completed discovery interview found for session ${swarmSessionId}.`,
        timestamp: new Date().toISOString(),
      },
      audit: { payload: { swarmSessionId, reason: 'bundle not found or incomplete' }, policyStatus: 'denied' },
    })
    return
  }

  const ctx: SwarmContext = {
    vendorName: catalog.vendorName,
    itemCount: catalog.items.length,
    hitlThreshold: policyRules.hitlThreshold,
  }

  const dispatched = await dispatchDomainAgents({
    vendorName: catalog.vendorName,
    catalogItemNames: catalog.items.map((item) => (item as { name: string }).name),
  })

  emit({
    name: 'system_alert',
    broadcast: {
      level: 'info',
      message: `Swarm hand-off starting for ${ctx.vendorName} (session ${swarmSessionId}).`,
      timestamp: new Date().toISOString(),
    },
  })

  // Stage 1: PO
  if (!(await runSwarmStage(emit, sessionId, 'PO', SWARM_THOUGHTS.po(ctx), { auditPayload: { swarmSessionId } }))) return
  await swarmHandoff(emit, 'PO', 'Architect')
  await sleep(SWARM_STAGE_GAP_MS)

  // Stage 2: Architect
  if (!(await runSwarmStage(emit, sessionId, 'Architect', SWARM_THOUGHTS.architect(ctx), { auditPayload: { swarmSessionId } })))
    return
  await swarmHandoff(emit, 'Architect', dispatched[0]?.agent ?? 'Policy')
  await sleep(SWARM_STAGE_GAP_MS)

  // Stage 3..N: dynamically dispatched domain micro-agents (Task 11.5) — a
  // real, variable-length sub-sequence, not a single placeholder node.
  emit({
    name: 'system_alert',
    broadcast: {
      level: 'info',
      message: `Dispatching ${dispatched.length} domain micro-agent(s): ${dispatched.map((d) => d.agent).join(', ')}.`,
      timestamp: new Date().toISOString(),
    },
    audit: { payload: { swarmSessionId, dispatched: dispatched.map((d) => d.agent) } },
  })

  for (let i = 0; i < dispatched.length; i++) {
    const result = dispatched[i]!
    const ok = await runSwarmStage(emit, sessionId, result.agent, result.summary, {
      auditPayload: { swarmSessionId, schema: result.schema },
    })
    if (!ok) return

    const next = dispatched[i + 1]?.agent ?? 'Policy'
    await swarmHandoff(emit, result.agent, next)
    await sleep(SWARM_STAGE_GAP_MS)
  }

  // Stage N+1: Policy — genuinely evaluated, not simulated, and now also
  // records which domain agents fed into this decision. Its resolved (and
  // possibly clamped) auto-approve ceiling is what Lead Dev embeds into the
  // synthesized app below — the same value, not recomputed independently.
  let autoApproveCeiling = SYSTEM_CEILING.maxAutoApproveThreshold
  const policyStageOk = await runSwarmStage(emit, sessionId, 'Policy', SWARM_THOUGHTS.policy(), {
    auditPayload: { swarmSessionId, dispatchedAgents: dispatched.map((d) => d.agent) },
    onTokensDone: () => {
      const policyCheck = resolveOrderThreshold(ctx.hitlThreshold)
      autoApproveCeiling = policyCheck.value!
      const policyEvent: Omit<PipelineEvent, 'sessionId'> = {
        name: 'policy_check',
        audit: {
          payload: { type: 'order_threshold', swarmSessionId, ...policyCheck },
          policyStatus: policyCheck.clamped ? 'clamped' : 'allowed',
        },
      }
      if (policyCheck.clamped) {
        policyEvent.notify = { type: 'warning', message: policyCheck.reason ?? 'Policy value clamped.' }
      }
      emit(policyEvent)
    },
  })
  if (!policyStageOk) return
  await swarmHandoff(emit, 'Policy', 'Lead Dev')
  await sleep(SWARM_STAGE_GAP_MS)

  // Stage N+2: Lead Dev — synthesizes the real, executable order-entry app
  // (Task 11.6) from the interview's catalog + the resolved policy ceiling
  // + the dispatched agents' labels, streaming it exactly like the classic
  // pipeline's generated_app_payload chunks so `sandboxStore.ts` needs zero
  // changes to render it.
  const code = synthesizeOrderEntryApp(
    swarmSessionId,
    ctx.vendorName,
    catalog.items as SwarmCatalogItem[],
    autoApproveCeiling,
    SYSTEM_CEILING.maxOrderThreshold,
    dispatched,
  )

  const leadDevOk = await runSwarmStage(emit, sessionId, 'Lead Dev', SWARM_THOUGHTS.leadDev(ctx, dispatched), {
    auditPayload: { swarmSessionId, dispatchedAgents: dispatched.map((d) => d.agent) },
    onTokensDone: async () => {
      for (const chunk of chunkString(code, CODE_CHUNK_SIZE)) {
        if (isAborted(sessionId)) return
        emit({ name: 'generated_app_payload', broadcast: { scenario: 'swarm-order-entry', code: chunk, done: false } })
        await sleep(CODE_CHUNK_DELAY_MS)
      }
      if (isAborted(sessionId)) return
      emit({
        name: 'generated_app_payload',
        broadcast: { scenario: 'swarm-order-entry', code, done: true },
        audit: { payload: { swarmSessionId, scenario: 'swarm-order-entry', size: code.length } },
      })
    },
  })
  if (!leadDevOk) return

  emit({
    name: 'pipeline_completed',
    data: { scenario: 'swarm-order-entry', code, prompt: `Swarm build: ${ctx.vendorName}`, bundleSessionId: swarmSessionId },
    notify: { type: 'success', message: `Build complete — ${ctx.vendorName}` },
  })

  emit({
    name: 'system_alert',
    broadcast: {
      level: 'info',
      message: `Swarm hand-off complete for ${ctx.vendorName} — Andiamo launch ready.`,
      timestamp: new Date().toISOString(),
    },
  })
}

/**
 * Shared connection handler for both the primary `/api/agent/stream`
 * endpoint and the always-spectate `/api/agent/spectate` endpoint (see
 * routes/spectatorStream.ts). Every connection — builder or spectator — is
 * "just" a subscriber to the session-wide broadcast; the only difference is
 * whether this particular call also kicks off `runPipeline()`.
 */
export function serveSessionStream(c: Context, role: SessionRole, sessionId: string, prompt?: string, swarmSessionId?: string) {
  return streamSSE(c, async (stream) => {
    let eventId = 0
    let closed = false
    stream.onAbort(() => {
      closed = true
      if (role === 'builder') requestAbort(sessionId)
    })

    const send = (event: string, data: unknown) =>
      stream.writeSSE({ event, id: String(eventId++), data: JSON.stringify(data) })

    await send('session_role', { role, sessionId })

    // Seed with whatever's already happened in the current build, then
    // subscribe for live frames — synchronous back-to-back (no `await`
    // between them), so there's no gap a concurrently-broadcast frame could
    // fall through (see sessionManager.ts's subscribe() doc comment).
    const pending: SessionFrame[] = getBacklog()
    let wake = () => {}
    const unsubscribe = subscribe((frame) => {
      pending.push(frame)
      wake()
    })
    stream.onAbort(() => unsubscribe())

    if (role === 'builder') {
      const run = swarmSessionId ? runSwarmPipeline(sessionId, swarmSessionId) : runPipeline(sessionId, prompt)
      void run.finally(() => endSession(sessionId))
    }

    while (!closed) {
      while (pending.length > 0) {
        const frame = pending.shift()!
        await send(frame.event, frame.data)
        if (frame.event === 'session_ended') {
          unsubscribe()
          return
        }
      }
      if (closed) return
      await new Promise<void>((resolve) => {
        wake = resolve
        stream.onAbort(resolve)
      })
      wake = () => {}
    }
  })
}

export function agentStreamHandler(c: Context) {
  // Optional: `?prompt=...` opts a claimed builder's Lead Dev stage into
  // additionally synthesizing and streaming a generated_app_payload.
  const prompt = c.req.query('prompt')
  // Optional (mutually exclusive with `?prompt=`, and takes precedence if
  // both are given): `?swarmSessionId=...` runs the UOW-11 conversational
  // swarm telemetry pipeline against a completed PO interview bundle instead
  // of the classic Planner/Architect/Lead Dev/Reviewer simulation.
  const swarmSessionId = c.req.query('swarmSessionId')

  if (swarmSessionId && !isValidSessionId(swarmSessionId)) {
    return c.json({ error: 'invalid swarmSessionId' }, 400)
  }

  // Pass C: correlates this connection to a visitor for the Admin Usage &
  // Session Drawer. Optional and loosely validated (an old/incognito tab
  // with no visitorId yet just isn't tracked) — never blocks the pipeline.
  const visitorIdParam = c.req.query('visitorId')
  const handleParam = c.req.query('handle')
  const visitorId = isValidVisitorId(visitorIdParam) ? visitorIdParam : null

  // System Ceiling: every connection is an "API call" against the platform's
  // hard rate limit (see policyEngine.ts / AGENTZ-STUDIO-SDK.md section 6).
  // Checked before claiming a session role at all, so a denial is a plain 429.
  const rateLimit = checkRateLimit()
  if (!rateLimit.allowed) {
    emitPipelineEvent({
      name: 'rate_limit_denied',
      audit: { payload: { prompt: prompt ?? null, swarmSessionId: swarmSessionId ?? null, reason: rateLimit.reason }, policyStatus: 'denied' },
    })
    return c.json({ error: rateLimit.reason }, 429)
  }

  const { role, sessionId } = claimSession()
  emitPipelineEvent({
    name: 'stream_connected',
    sessionId,
    audit: { payload: { prompt: prompt ?? null, swarmSessionId: swarmSessionId ?? null, role } },
  })

  // Only the connection actually driving the pipeline (not a spectator, and
  // not the classic prompt-only demo/Cookbook path) counts as "Swarm
  // Executed" — the ask's own high-intent example is specifically a real
  // PO-interview-driven swarm build, not the boot demo.
  if (visitorId && role === 'builder') {
    const handle = sanitizeHandle(handleParam)
    touchVisitor(visitorId, handle)
    linkPipelineSession(visitorId, sessionId)
    if (swarmSessionId) {
      addMilestone(visitorId, 'Swarm Executed')
      sendHighValueAlert(`🚀 ${handle} launched a Swarm Build (session ${swarmSessionId}).`, {
        visitorId,
        handle,
        swarmSessionId,
      })
    }
  }

  return serveSessionStream(c, role, sessionId, prompt, swarmSessionId)
}
