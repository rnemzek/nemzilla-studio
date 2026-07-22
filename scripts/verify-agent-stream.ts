import { spawn } from 'node:child_process'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const PORT = Number(process.env.TEST_PORT ?? 4188)
const BASE_URL = `http://127.0.0.1:${PORT}`
const HEALTH_URL = `${BASE_URL}/api/health`
const STREAM_URL = `${BASE_URL}/api/agent/stream`

const ALLOWED_EVENTS = new Set(['agent_step', 'token_stream', 'metric_tick', 'system_alert'])
const ALLOWED_EVENTS_WITH_PROMPT = new Set([...ALLOWED_EVENTS, 'generated_app_payload'])
const EXPECTED_AGENTS = ['Planner', 'Architect', 'Lead Dev', 'Reviewer']

interface SseFrame {
  event: string
  id: string
  data: unknown
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function parseFrames(raw: string): SseFrame[] {
  return raw
    .split('\n\n')
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk) => {
      const lines = chunk.split('\n')
      let event = ''
      let id = ''
      const dataLines: string[] = []
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice('event: '.length)
        else if (line.startsWith('id: ')) id = line.slice('id: '.length)
        else if (line.startsWith('data: ')) dataLines.push(line.slice('data: '.length))
      }
      return { event, id, data: JSON.parse(dataLines.join('\n')) as unknown }
    })
}

async function readFullStream(signal?: AbortSignal): Promise<string> {
  const res = await fetch(STREAM_URL, { signal })
  assert(res.ok, `expected 200 from stream, got ${res.status}`)
  assert(
    res.headers.get('content-type')?.includes('text/event-stream') ?? false,
    'expected text/event-stream content-type',
  )
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    raw += decoder.decode(value, { stream: true })
  }
  return raw
}

async function testFullPipeline() {
  console.log('-> consuming full agent stream to completion...')
  const start = Date.now()
  const raw = await readFullStream()
  const elapsedMs = Date.now() - start
  const frames = parseFrames(raw)

  assert(frames.length > 0, 'received no SSE frames')
  for (const frame of frames) {
    assert(ALLOWED_EVENTS.has(frame.event), `unexpected event type "${frame.event}"`)
  }

  assert(frames[0]!.event === 'system_alert', 'first frame should be a system_alert')
  assert(frames.at(-1)!.event === 'system_alert', 'last frame should be a system_alert')

  const ids = frames.map((f) => Number(f.id))
  for (let i = 1; i < ids.length; i++) {
    assert(ids[i] === ids[i - 1]! + 1, `event ids are not sequential at index ${i}`)
  }

  const steps = frames.filter((f) => f.event === 'agent_step')
  assert(
    steps.length === EXPECTED_AGENTS.length * 2,
    `expected ${EXPECTED_AGENTS.length * 2} agent_step events, got ${steps.length}`,
  )
  EXPECTED_AGENTS.forEach((agent, i) => {
    const executing = steps[i * 2]!.data as { agent: string; state: string }
    const done = steps[i * 2 + 1]!.data as { agent: string; state: string }
    assert(
      executing.agent === agent && executing.state === 'EXECUTING',
      `stage ${i} should start with ${agent} EXECUTING`,
    )
    assert(done.agent === agent && done.state === 'DONE', `stage ${i} should end with ${agent} DONE`)
  })

  const metricTicks = frames.filter((f) => f.event === 'metric_tick')
  assert(
    metricTicks.length === EXPECTED_AGENTS.length,
    `expected one metric_tick per agent, got ${metricTicks.length}`,
  )

  const tokenEvents = frames.filter((f) => f.event === 'token_stream')
  assert(tokenEvents.length > 0, 'expected token_stream events')

  console.log(`   ok: ${frames.length} frames in ${elapsedMs}ms, pipeline order verified`)
}

async function testAppGenerationPrompt() {
  console.log('-> requesting a generated_app_payload via ?prompt=ACME Order...')
  const res = await fetch(`${STREAM_URL}?${new URLSearchParams({ prompt: 'ACME Order' })}`)
  assert(res.ok, `expected 200 from prompted stream, got ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    raw += decoder.decode(value, { stream: true })
  }
  const frames = parseFrames(raw)

  for (const frame of frames) {
    assert(
      ALLOWED_EVENTS_WITH_PROMPT.has(frame.event),
      `unexpected event type "${frame.event}" on prompted stream`,
    )
  }

  const payloadFrames = frames.filter((f) => f.event === 'generated_app_payload')
  assert(payloadFrames.length > 1, 'expected multiple generated_app_payload chunks')

  const final = payloadFrames.at(-1)!.data as { scenario: string; code: string; done: boolean }
  assert(final.done === true, 'final generated_app_payload frame should have done: true')
  assert(final.scenario === 'acme-order', `expected acme-order scenario, got "${final.scenario}"`)
  assert(final.code.includes('ACME'), 'final payload code should mention ACME')

  const intermediate = payloadFrames.filter((f) => (f.data as { done: boolean }).done === false)
  assert(intermediate.length > 0, 'expected intermediate (done: false) chunks before the final one')

  console.log(`   ok: ${payloadFrames.length} generated_app_payload frames, final chunk matched scenario "acme-order"`)
}

async function testAbortDoesNotLeak() {
  console.log('-> aborting stream mid-flight and checking the server stays healthy...')
  const controller = new AbortController()
  const res = await fetch(STREAM_URL, { signal: controller.signal })
  const reader = res.body!.getReader()

  let raw = ''
  let framesSeen = 0
  const decoder = new TextDecoder()
  while (framesSeen < 3) {
    const { done, value } = await reader.read()
    if (done) break
    raw += decoder.decode(value, { stream: true })
    framesSeen = raw.split('\n\n').filter((c) => c.trim()).length
  }

  controller.abort()
  await reader.cancel().catch(() => {})
  await delay(300)

  const healthRes = await fetch(HEALTH_URL)
  assert(healthRes.ok, 'server did not stay healthy after an aborted stream connection')
  console.log('   ok: server served a fresh request immediately after a client abort')

  // Open several concurrent connections and abort them all right away. If server-side
  // onAbort() cleanup were broken, leftover handlers would degrade or hang later requests.
  const controllers = Array.from({ length: 5 }, () => new AbortController())
  await Promise.allSettled(controllers.map((c) => fetch(STREAM_URL, { signal: c.signal })))
  controllers.forEach((c) => c.abort())
  await delay(300)

  const start = Date.now()
  const raw2 = await readFullStream()
  const elapsedMs = Date.now() - start
  const frames2 = parseFrames(raw2)
  assert(
    frames2.at(-1)!.event === 'system_alert',
    'pipeline should still complete cleanly after concurrent aborts',
  )
  console.log(`   ok: fresh pipeline still completes cleanly in ${elapsedMs}ms after 5 concurrent aborts`)
}

async function waitForHealthy() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const res = await fetch(HEALTH_URL)
      if (res.ok) return
    } catch {
      // server not listening yet
    }
    await delay(150)
  }
  throw new Error('server did not become healthy within timeout')
}

async function main() {
  const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx')
  const server = spawn(tsxBin, ['server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let serverOutput = ''
  server.stdout?.on('data', (chunk: Buffer) => (serverOutput += chunk.toString()))
  server.stderr?.on('data', (chunk: Buffer) => (serverOutput += chunk.toString()))

  const shutdown = () =>
    new Promise<void>((resolve) => {
      server.once('exit', () => resolve())
      server.kill('SIGTERM')
      setTimeout(resolve, 2000)
    })

  try {
    await waitForHealthy()
    await testFullPipeline()
    await testAppGenerationPrompt()
    await testAbortDoesNotLeak()
    console.log('\nAll agent stream checks passed.')
  } catch (err) {
    console.error('\nFAIL:', err instanceof Error ? err.message : err)
    console.error('\n--- server output ---\n' + serverOutput)
    process.exitCode = 1
  } finally {
    await shutdown()
  }
}

main()
