import { apiClient } from './apiClient.ts'
import { startPoInterview, submitPoAnswer, SYSTEM_ORDER_CEILING, type PoInterviewState } from './poInterview.ts'
import { getSessionBundle, putSessionArtifact, type SessionBundle } from './sessionBundleClient.ts'
import { sandboxStore } from './sandboxStore.ts'
import { publishInterviewSnapshot, interviewState } from './interviewStore.ts'
import { openAdminDrawer } from './adminDrawerStore.ts'
import { auditStore } from './auditStore.ts'
import { startReplay, stopReplay } from './replayStore.ts'
import type { SavedRunCatalog, SavedRunPolicyRules } from './runHistoryStore.ts'

export type OutputKind = 'input' | 'output' | 'error' | 'system' | 'po'

export interface CommandContext {
  print: (text: string, kind?: OutputKind) => void
  clear: () => void
}

/**
 * Pass D: commands are now `/`-prefixed — free text (no leading slash)
 * always routes straight to the AI PO conversational stream instead of
 * being parsed as a shell command. This list backs both `/help`'s output and
 * Terminal.tsx's inline slash-command palette, so the two can never drift.
 */
export interface SlashCommandInfo {
  name: string
  usage: string
  description: string
}

export const SLASH_COMMANDS: SlashCommandInfo[] = [
  { name: 'build', usage: '/build', description: 'Start (or restart) the AI PO discovery interview.' },
  { name: 'andiamo', usage: '/andiamo', description: 'Launch the swarm build from a completed interview.' },
  { name: 'replay', usage: '/replay', description: 'Replay the current session step-by-step on the Swarm Canvas.' },
  { name: 'reset', usage: '/reset', description: 'Cancel any active interview and clear the terminal.' },
  { name: 'run', usage: '/run [task]', description: 'Stream the full agent pipeline, verbose.' },
  { name: 'triad', usage: '/triad [task]', description: 'Condensed agent pipeline status pass.' },
  { name: 'metrics', usage: '/metrics', description: 'Query /api/health for live status and latency.' },
  { name: 'launch', usage: '/launch [target]', description: 'Open an ecosystem link (robert, streaming, grid).' },
  { name: 'admin', usage: '/admin', description: 'Open the Usage & Session Drawer.' },
  { name: 'clear', usage: '/clear', description: 'Clear the terminal output.' },
  { name: 'help', usage: '/help', description: 'Show this list of commands.' },
]

const LAUNCH_TARGETS: Record<string, string> = {
  robert: 'https://robert.nemzilla.net',
  streaming: 'https://streaming.nemzilla.net',
  grid: 'https://grid.nemzilla.net',
}

const HELP_TEXT = [
  'Just type what you want to build — free text always goes straight to the AI PO.',
  '',
  'Slash commands (type "/" to see this list inline as you type):',
  ...SLASH_COMMANDS.map((c) => `  ${c.usage.padEnd(18)}${c.description}`),
  '',
  'Once the AI PO confirms it has everything it needs, click "Build" or just',
  'say so — "build it", "go", "looks good", and "make the app" all launch the',
  'swarm build into App Preview.',
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
 * Starts a fresh interview. `openingMessage`, when given, is the user's own
 * free text (Pass D: *all* free text routes here when no interview is
 * active) — it becomes the first real turn of the conversation instead of
 * being discarded.
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
 * Pass A: natural, conversational ways to launch the swarm build once the
 * interview is done — replaces the old hard requirement to type the secret
 * word "andiamo". `/andiamo` still works as an explicit slash command too;
 * this set is what lets *free text* like "build it"/"go" also trigger it.
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

/**
 * Pass D: free text is unconditional now — no more meta-command interception
 * for "cancel"/"help"/"clear" mid-interview (those all move to explicit
 * slash commands, checked in runCommand() *before* this is ever reached).
 * Every line the user types while an interview is active is a genuine
 * conversational turn sent straight to the AI PO.
 */
async function continueInterview(ctx: CommandContext, rawInput: string): Promise<void> {
  const state = activeInterview!
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
    ctx.print('No completed discovery interview yet — just tell me what you want to build.', 'error')
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
    ctx.print('Usage: /launch <target>', 'output')
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

/**
 * Pass D: `/replay` — builds an ephemeral, `SavedRun`-shaped snapshot of
 * whatever's currently live (mirrors ArtifactsPanel.tsx's "Replay Current
 * Run" button, which reads the exact same three reactive sources) and hands
 * it to replayStore.ts. SwarmCanvas.tsx picks it up immediately since
 * `replayState` is a shared singleton — no round trip through this module.
 */
function runReplay(ctx: CommandContext): void {
  const auditBlocks = auditStore.state.blocks
  if (auditBlocks.length === 0) {
    ctx.print('Nothing to replay yet — build something first.', 'error')
    return
  }

  const live = interviewState.interview
  const catalog: SavedRunCatalog | null = live?.vendorName && live.catalog ? { vendorName: live.vendorName, items: live.catalog } : null
  const policyRules: SavedRunPolicyRules | null =
    live?.hitlThreshold != null
      ? { hitlThreshold: live.hitlThreshold, autoApproveThreshold: live.hitlThreshold, autoDenyThreshold: SYSTEM_ORDER_CEILING }
      : null

  startReplay({
    id: 'live-session',
    name: 'Current Session (live)',
    createdAt: new Date().toISOString(),
    transcript: live?.transcript ?? [],
    catalog,
    policyRules,
    auditBlocks,
    code: sandboxStore.state.code,
  })
  ctx.print('Replay started — see the Step X of Y scrubber on the Swarm Canvas above.', 'system')
}

/** Pass D: `/reset` — cancels any active interview, exits Replay Mode if active, and clears the terminal for a fresh start. */
function runReset(ctx: CommandContext): void {
  activeInterview = null
  publishInterviewSnapshot(null)
  stopReplay()
  ctx.clear()
  ctx.print('Session reset. What would you like to build?', 'system')
}

async function runSlashCommand(ctx: CommandContext, rawInput: string): Promise<void> {
  const [name, ...args] = rawInput.slice(1).split(/\s+/)
  const command = (name ?? '').toLowerCase()

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
      if (activeInterview && !activeInterview.done) {
        ctx.print('A discovery interview is already in progress — answer above, or type "/reset" to start over.', 'error')
      } else {
        await startInterview(ctx)
      }
      break
    case 'andiamo':
      await runAndiamo(ctx)
      break
    case 'admin':
    case 'sessions':
      openAdminDrawer()
      ctx.print('Opening the Usage & Session Drawer…', 'system')
      break
    case 'replay':
      runReplay(ctx)
      break
    case 'reset':
      runReset(ctx)
      break
    case '':
      HELP_TEXT.forEach((line) => ctx.print(line, 'output'))
      break
    default:
      ctx.print(`unknown command: /${command} (type "/help" for a list, or "/" to see the palette)`, 'error')
  }
}

/**
 * Pass D: the CLI's routing model is now simple and unconditional —
 * anything starting with "/" is a command; everything else is free text
 * that always goes to the AI PO conversational stream (starting a fresh
 * interview if none is active, continuing one if it's in progress, or
 * launching the swarm build if it's done and the text is a launch phrase).
 * There is no more "command not found" for a plain word — that's the whole
 * point of moving commands behind "/".
 */
export async function runCommand(rawInput: string, ctx: CommandContext): Promise<void> {
  const trimmed = rawInput.trim()
  if (!trimmed) return

  if (trimmed.startsWith('/')) {
    await runSlashCommand(ctx, trimmed)
    return
  }

  if (activeInterview && !activeInterview.done) {
    await continueInterview(ctx, trimmed)
    return
  }

  if (activeInterview?.done && isLaunchTrigger(trimmed)) {
    await runAndiamo(ctx)
    return
  }

  await startInterview(ctx, trimmed)
}
