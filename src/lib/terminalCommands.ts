import { apiClient } from './apiClient.ts'
import { startPoInterview, submitPoAnswer, SYSTEM_ORDER_CEILING, type PoInterviewState } from './poInterview.ts'
import { getSessionBundle, putSessionArtifact, type SessionBundle } from './sessionBundleClient.ts'
import { sandboxStore } from './sandboxStore.ts'
import { publishInterviewSnapshot } from './interviewStore.ts'
import { openAdminDrawer } from './adminDrawerStore.ts'

export type OutputKind = 'input' | 'output' | 'error' | 'system' | 'po'

export interface CommandContext {
  print: (text: string, kind?: OutputKind) => void
  clear: () => void
}

export const COMMANDS = ['help', 'run', 'triad', 'metrics', 'clear', 'launch', 'build', 'andiamo', 'admin', 'sessions'] as const

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
  '  clear             Clear the terminal output.',
  '',
  'Tip: typing a full sentence instead of a command (e.g. "I want to build an',
  'order entry app for my bakery") starts the AI PO interview automatically.',
  '',
  'Once the AI PO confirms it has everything it needs, click the "Build"',
  'button or just say so — "build it", "go", "looks good", and "make the',
  'app" all launch the swarm build into App Preview.',
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

/**
 * Starts a fresh interview. `openingMessage`, when given, is real user text
 * that failed to match any known command (the CLI fallback in runCommand())
 * — it becomes the first real turn of the conversation instead of being
 * discarded, so a sentence like "I want to build an order entry app for my
 * bakery" isn't wasted on a "command not found" error.
 */
async function startInterview(ctx: CommandContext, openingMessage?: string): Promise<void> {
  const step = await startPoInterview(openingMessage)
  activeInterview = step.state
  publishInterviewSnapshot(activeInterview)
  printPo(ctx, step.reply)
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

/**
 * Meta-commands intercepted locally, for free, before ever reaching the LLM
 * — "help" or "clear" typed mid-interview must never be sent to the model
 * as if they were an answer (the old FSM's exact failure mode: it would
 * have literally set e.g. vendorName = "help"). Genuine natural-language
 * questions or off-topic remarks are NOT intercepted here — handling those
 * gracefully is the model's job now, not a fixed keyword list's.
 */
const INTERVIEW_META_COMMANDS = new Set(['cancel', 'exit', 'quit'])

/**
 * Pass A: natural, conversational ways to launch the swarm build once the
 * interview is done — replaces the old hard requirement to type the secret
 * word "andiamo". `andiamo` still works (see runAndiamo/runCommand's switch
 * case below); it's just no longer the only or advertised way in.
 */
const LAUNCH_TRIGGER_PHRASES = new Set([
  'andiamo',
  'build',
  'build it',
  'build the app',
  'make the app',
  'looks good',
  'go',
  'go for it',
  "let's go",
  "let's build",
  "let's build it",
  'start build',
  'start the build',
  'ship it',
  'launch',
  'launch it',
])

function isLaunchTrigger(rawInput: string): boolean {
  return LAUNCH_TRIGGER_PHRASES.has(rawInput.trim().toLowerCase())
}

async function continueInterview(ctx: CommandContext, rawInput: string): Promise<void> {
  const state = activeInterview!
  const lower = rawInput.toLowerCase()

  if (INTERVIEW_META_COMMANDS.has(lower)) {
    printPo(ctx, 'Interview cancelled.')
    activeInterview = null
    publishInterviewSnapshot(null)
    return
  }
  if (lower === 'help') {
    HELP_TEXT.forEach((line) => ctx.print(line, 'output'))
    return
  }
  if (lower === 'clear') {
    ctx.clear()
    return
  }

  const step = await submitPoAnswer(state, rawInput)
  publishInterviewSnapshot(state)
  printPo(ctx, step.reply)

  if (step.done) {
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
  if (!activeInterview || !activeInterview.done) {
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
  // (or a meta-command like "cancel"/"help"/"clear") rather than a shell
  // command — a chat interface, not a command dispatcher, until the
  // interview is done.
  if (activeInterview && !activeInterview.done) {
    await continueInterview(ctx, trimmed)
    return
  }

  // Pass A: once the interview is done, a natural launch phrase ("build it",
  // "go", "looks good", the still-supported "andiamo", ...) starts the swarm
  // build — checked here, before the switch below, so it takes priority over
  // e.g. the literal `build` case, which would otherwise start a *second*,
  // unrelated interview and discard the completed one.
  if (activeInterview?.done && isLaunchTrigger(trimmed)) {
    await runAndiamo(ctx)
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
      await startInterview(ctx)
      break
    case 'andiamo':
      await runAndiamo(ctx)
      break
    case 'admin':
    case 'sessions':
      openAdminDrawer()
      ctx.print('Opening the Usage & Session Drawer…', 'system')
      break
    default:
      // UOW-13 CLI fallback: a genuinely unparsed *multi-word* string reads
      // as a natural-language request, not a mistyped command — start the
      // AI PO interview with it as the opening turn instead of erroring.
      // A single unrecognized word stays a plain error (cheap typos
      // shouldn't silently trigger a billed LLM call).
      if (args.length > 0) {
        await startInterview(ctx, trimmed)
      } else {
        ctx.print(`command not found: ${command} (type "help" for a list)`, 'error')
      }
  }
}
