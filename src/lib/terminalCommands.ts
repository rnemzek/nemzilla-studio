import { apiClient } from './apiClient.ts'

export type OutputKind = 'input' | 'output' | 'error' | 'system'

export interface CommandContext {
  print: (text: string, kind?: OutputKind) => void
  clear: () => void
}

export const COMMANDS = ['help', 'run', 'triad', 'metrics', 'clear', 'launch'] as const

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
    default:
      ctx.print(`command not found: ${command} (type "help" for a list)`, 'error')
  }
}
