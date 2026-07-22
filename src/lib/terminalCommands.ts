import { apiClient } from './apiClient.ts'
import { createPoInterview, submitPoAnswer, SYSTEM_ORDER_CEILING, type PoInterviewState } from './poInterview.ts'
import { getSessionBundle, putSessionArtifact, type SessionBundle } from './sessionBundleClient.ts'
import { sandboxStore } from './sandboxStore.ts'

export type OutputKind = 'input' | 'output' | 'error' | 'system' | 'po'

export interface CommandContext {
  print: (text: string, kind?: OutputKind) => void
  clear: () => void
}

export const COMMANDS = ['help', 'run', 'triad', 'metrics', 'clear', 'launch', 'build', 'andiamo'] as const

const LAUNCH_TARGETS: Record<string, string> = {
  robert: 'https://robert.nemzilla.net',
  streaming: 'https://streaming.nemzilla.net',
  grid: 'https://grid.nemzilla.net',
}

const HELP_TEXT = [
  'Available commands:',
  '  help              Show this list of commands.',
  '  run [task]        Stream a full agent pipeline run (Planner -> Architect -> Lead Dev -> Reviewer).',
  '  triad             Condensed status pass over the agent pipeline (no reasoning text).',
  '  metrics           Query /api/health for live status, uptime, and round-trip latency.',
  '  launch [target]   Open an ecosystem link (robert, streaming, grid) or list targets.',
  '  build             Start the AI PO discovery interview (vendor name, catalog, HITL threshold).',
  '  andiamo           Launch the swarm build from the completed interview into App Preview.',
  '  clear             Clear the terminal output.',
]

function parseFrame(chunk: string): { event: string; data: Record<string, unknown> } {
  let event = ''
  const dataLines: string[] = []
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice('event: '.length)
    else if (line.startsWith('data: ')) dataLines.push(line.slice('data: '.length))
  }
  if (!event || dataLines.length === 0) return { event: '', data: {} }
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) as Record<string, unknown> }
  } catch {
    return { event: '', data: {} }
  }
}

async function streamPipeline(ctx: CommandContext, task: string, verbose: boolean) {
  ctx.print(`> running pipeline${task ? `: ${task}` : ''}`, 'system')
  const startedAt = performance.now()

  const res = await apiClient.api.agent.stream.$get()
  if (!res.body) {
    ctx.print('stream error: empty response body', 'error')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let tokenBuffer = ''

  const flushTokens = (agent: string) => {
    if (tokenBuffer) {
      ctx.print(`     [${agent}] "${tokenBuffer.trim()}"`, 'output')
      tokenBuffer = ''
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const { event, data } = parseFrame(buffer.slice(0, boundary))
      buffer = buffer.slice(boundary + 2)

      switch (event) {
        case 'session_role':
          if (data.role === 'spectator') {
            ctx.print('⚠ a build is already active — spectating the current run instead of starting a new one', 'system')
          }
          break
        case 'token_stream':
          if (verbose) tokenBuffer += String(data.token)
          break
        case 'agent_step':
          if (data.state === 'DONE' && verbose) flushTokens(String(data.agent))
          ctx.print(`[${data.agent}] ${data.state}`, 'output')
          break
        case 'metric_tick':
          ctx.print(`     latency=${data.latencyMs}ms  mem=${data.memoryMb}MB`, 'system')
          break
        case 'system_alert':
          ctx.print(`* ${data.message}`, 'system')
          break
      }

      boundary = buffer.indexOf('\n\n')
    }
  }

  ctx.print(`stream closed — ${Math.round(performance.now() - startedAt)}ms total`, 'system')
}

async function runMetrics(ctx: CommandContext) {
  const startedAt = performance.now()
  const res = await apiClient.api.health.$get()
  const latencyMs = Math.round(performance.now() - startedAt)

  if (!res.ok) {
    ctx.print(`metrics error: HTTP ${res.status}`, 'error')
    return
  }

  const body = await res.json()
  ctx.print(`status:    ${body.status}`, 'output')
  ctx.print(`uptime:    ${body.uptime.toFixed(1)}s`, 'output')
  ctx.print(`latency:   ${latencyMs}ms (round trip)`, 'output')
  ctx.print(`timestamp: ${body.timestamp}`, 'output')
}

// Module-level (per browser tab, not server-wide) — mirrors the interview's
// lifecycle across multiple runCommand() calls the same way sessionManager.ts
// tracks the server-wide builder lock across multiple connections.
let activeInterview: PoInterviewState | null = null

/** The RN avatar (rendered by Terminal.tsx for 'po'-kind lines) replaces the old literal "[AI PO] " text prefix. */
function printPo(ctx: CommandContext, message: string) {
  ctx.print(message, 'po')
}

function printPoLines(ctx: CommandContext, state: PoInterviewState, fromIndex: number) {
  for (let i = fromIndex; i < state.transcript.length; i++) {
    const entry = state.transcript[i]!
    if (entry.role === 'po') printPo(ctx, entry.message)
  }
}

function startInterview(ctx: CommandContext) {
  activeInterview = createPoInterview()
  printPoLines(ctx, activeInterview, 0)
}

/** Best-effort persistence — Task 11.1's session bundle recorder; failures are logged client-side but never block the conversation. */
async function persistInterviewArtifacts(state: PoInterviewState): Promise<void> {
  await putSessionArtifact(state.sessionId, 'poTranscript', state.transcript)
  if (state.vendorName && state.catalog) {
    await putSessionArtifact(state.sessionId, 'catalog', { vendorName: state.vendorName, items: state.catalog })
  }
  if (state.hitlThreshold !== null) {
    await putSessionArtifact(state.sessionId, 'policyRules', {
      hitlThreshold: state.hitlThreshold,
      autoApproveThreshold: state.hitlThreshold,
      autoDenyThreshold: SYSTEM_ORDER_CEILING,
    })
  }
}

async function continueInterview(ctx: CommandContext, rawInput: string): Promise<void> {
  const state = activeInterview!

  if (rawInput.toLowerCase() === 'cancel') {
    printPo(ctx, 'Interview cancelled.')
    activeInterview = null
    return
  }

  const beforeLength = state.transcript.length
  const { done } = submitPoAnswer(state, rawInput)
  // submitPoAnswer already appended the user's line to the transcript before
  // the PO's reply — only print the PO's own new line(s), the user's answer
  // was already echoed by Terminal.tsx's `$ ${value}` print before dispatch.
  printPoLines(ctx, state, beforeLength + 1)

  if (done) {
    await persistInterviewArtifacts(state)
    printPo(ctx, `Discovery interview recorded (session ${state.sessionId}).`)
  }
}

function summarizeBundle(ctx: CommandContext, sessionId: string, bundle: SessionBundle) {
  const catalog = bundle.catalog as { vendorName: string; items: { name: string; price: number }[] } | null
  const policyRules = bundle.policyRules as { hitlThreshold: number } | null
  ctx.print(`vendor:        ${catalog?.vendorName ?? 'unknown'}`, 'output')
  ctx.print(`catalog items: ${catalog?.items.length ?? 0}`, 'output')
  ctx.print(`HITL ceiling:  $${policyRules?.hitlThreshold ?? '?'}`, 'output')
  ctx.print(`session:       ${sessionId}`, 'output')
}

async function runAndiamo(ctx: CommandContext): Promise<void> {
  if (!activeInterview || activeInterview.stage !== 'complete') {
    ctx.print('No completed discovery interview yet — type "build" to start one.', 'error')
    return
  }

  printPo(ctx, 'Andiamo! Verifying the hand-off package...')
  const bundle = await getSessionBundle(activeInterview.sessionId)
  if (!bundle) {
    ctx.print('hand-off error: could not read back the session bundle', 'error')
    return
  }

  summarizeBundle(ctx, activeInterview.sessionId, bundle)
  ctx.print('Launching the swarm build into App Preview — watch the Swarm Canvas for live telemetry.', 'system')
  // Fire-and-forget, mirroring CookbookDropdown.tsx's connectGenerator() call —
  // AppPreview renders whatever this connection streams back, and the
  // Swarm Canvas (a pure spectator) picks up the same broadcast telemetry
  // independently. If a build is already active server-wide, this becomes a
  // spectator of it instead of a competing build (see sessionManager.ts).
  sandboxStore.connectSwarmGenerator(activeInterview.sessionId)
}

function runLaunch(ctx: CommandContext, target?: string) {
  if (!target) {
    ctx.print(`Ecosystem targets: ${Object.keys(LAUNCH_TARGETS).join(', ')}`, 'output')
    ctx.print('Usage: launch <target>', 'output')
    return
  }

  const url = LAUNCH_TARGETS[target.toLowerCase()]
  if (!url) {
    ctx.print(`unknown launch target "${target}" (try: ${Object.keys(LAUNCH_TARGETS).join(', ')})`, 'error')
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
  ctx.print(`launching ${url} ...`, 'system')
}

export async function runCommand(rawInput: string, ctx: CommandContext): Promise<void> {
  const trimmed = rawInput.trim()
  if (!trimmed) return

  // While an interview is in progress, every line is an answer to the AI PO
  // (or "cancel") rather than a shell command — a chat interface, not a
  // command dispatcher, until the interview reaches its 'complete' stage.
  if (activeInterview && activeInterview.stage !== 'complete') {
    await continueInterview(ctx, trimmed)
    return
  }

  const [name, ...args] = trimmed.split(/\s+/)
  const command = name!.toLowerCase()

  switch (command) {
    case 'help':
      HELP_TEXT.forEach((line) => ctx.print(line, 'output'))
      break
    case 'clear':
      ctx.clear()
      break
    case 'run':
      await streamPipeline(ctx, args.join(' '), true)
      break
    case 'triad':
      await streamPipeline(ctx, args.join(' '), false)
      break
    case 'metrics':
      await runMetrics(ctx)
      break
    case 'launch':
      runLaunch(ctx, args[0])
      break
    case 'build':
      startInterview(ctx)
      break
    case 'andiamo':
      await runAndiamo(ctx)
      break
    default:
      ctx.print(`command not found: ${command} (type "help" for a list)`, 'error')
  }
}
