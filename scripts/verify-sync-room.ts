import { spawn } from 'node:child_process'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const PORT = Number(process.env.TEST_PORT ?? 4194)
const BASE_URL = `http://127.0.0.1:${PORT}`
const HEALTH_URL = `${BASE_URL}/api/health`

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

/** Reads whatever SSE frames have arrived within `windowMs`, then aborts the connection. */
async function readFramesFor(url: string, windowMs: number): Promise<SseFrame[]> {
  const controller = new AbortController()
  const res = await fetch(url, { signal: controller.signal })
  assert(res.ok, `expected 200 from ${url}, got ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  const deadline = Date.now() + windowMs
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now()
    const { done, value } = await Promise.race([
      reader.read(),
      delay(remaining).then(() => ({ done: false as const, value: undefined })),
    ])
    if (done) break
    if (value) raw += decoder.decode(value, { stream: true })
  }
  controller.abort()
  await reader.cancel().catch(() => {})
  return parseFrames(raw)
}

async function testTwoDeviceSync() {
  console.log('-> connecting two subscribers to the same sync room and broadcasting a task update...')
  const roomId = `test-room-${Date.now()}`

  const deviceAPromise = readFramesFor(`${BASE_URL}/api/sync/${roomId}`, 1500)
  const deviceBPromise = readFramesFor(`${BASE_URL}/api/sync/${roomId}`, 1500)

  await delay(200)

  const tasks = [{ id: 'task-0', name: 'Buy milk', completed: true }]
  const postRes = await fetch(`${BASE_URL}/api/sync/${roomId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  })
  assert(postRes.ok, `expected 200 from POST /api/sync/${roomId}, got ${postRes.status}`)
  const postBody = (await postRes.json()) as { ok?: boolean }
  assert(postBody.ok === true, 'expected { ok: true } from the broadcast POST')

  const [framesA, framesB] = await Promise.all([deviceAPromise, deviceBPromise])

  for (const frames of [framesA, framesB]) {
    const stateFrames = frames.filter((f) => f.event === 'state')
    assert(stateFrames.length > 0, 'expected at least one "state" SSE frame')
    const last = stateFrames.at(-1)!.data as { tasks: unknown }
    assert(JSON.stringify(last.tasks) === JSON.stringify(tasks), 'expected the broadcast task state to reach this subscriber')
  }

  console.log('   ok: both concurrent subscribers received the broadcast task state in real time')
}

async function testLateJoinerGetsLastKnownState() {
  console.log('-> checking a late-joining subscriber immediately receives the room\'s last known state...')
  const roomId = `test-room-late-${Date.now()}`
  const tasks = [{ id: 'task-0', name: 'Walk the dog', completed: false }]

  const postRes = await fetch(`${BASE_URL}/api/sync/${roomId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  })
  assert(postRes.ok, `expected 200 from POST /api/sync/${roomId}, got ${postRes.status}`)

  const frames = await readFramesFor(`${BASE_URL}/api/sync/${roomId}`, 800)
  const stateFrames = frames.filter((f) => f.event === 'state')
  assert(stateFrames.length > 0, 'expected the late joiner to receive an initial "state" frame')
  const initial = stateFrames[0]!.data as { tasks: unknown }
  assert(JSON.stringify(initial.tasks) === JSON.stringify(tasks), 'expected the initial frame to carry the last broadcast task state')

  console.log('   ok: a subscriber connecting after the broadcast still gets the current task state immediately')
}

async function testMalformedBroadcastRejected() {
  console.log('-> checking a malformed sync POST is rejected before touching the room...')
  const roomId = `test-room-bad-${Date.now()}`

  const missingTasks = await fetch(`${BASE_URL}/api/sync/${roomId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assert(missingTasks.status === 400, `expected 400 for a body with no "tasks", got ${missingTasks.status}`)

  const malformedJson = await fetch(`${BASE_URL}/api/sync/${roomId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  })
  assert(malformedJson.status === 400, `expected 400 for malformed JSON, got ${malformedJson.status}`)

  console.log('   ok: missing-tasks and malformed-JSON broadcasts both rejected with 400')
}

/** UOW-6.2: the generated app's own client-side sync listener/broadcaster. */
async function testGeneratedAppIncludesSyncClient() {
  console.log('-> checking the ?prompt=Today Itinerary generated app for the sync client...')
  const res = await fetch(`${BASE_URL}/api/agent/stream?${new URLSearchParams({ prompt: 'Today Itinerary' })}`)
  assert(res.ok, `expected 200 from stream, got ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    raw += decoder.decode(value, { stream: true })
  }
  const frames = parseFrames(raw)
  const payloadFrames = frames.filter((f) => f.event === 'generated_app_payload')
  const final = payloadFrames.at(-1)!.data as { code: string; done: boolean }
  assert(final.done === true, 'final generated_app_payload frame should have done: true')

  assert(final.code.includes('SYNC_ROOM_ID'), 'expected the generated app to resolve a sync room id')
  assert(final.code.includes('/api/sync/'), 'expected the generated app to talk to /api/sync/:roomId')
  assert(final.code.includes('new EventSource('), 'expected the generated app to open an EventSource for live sync')
  assert(final.code.includes('broadcastTaskState'), 'expected task actions to broadcast their new state')
  assert(final.code.includes('initTaskSync'), 'expected the sync listener to be initialized on load')

  console.log('   ok: template-preview TODO app includes the multi-device sync client')
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
    await testTwoDeviceSync()
    await testLateJoinerGetsLastKnownState()
    await testMalformedBroadcastRejected()
    await testGeneratedAppIncludesSyncClient()
    console.log('\nAll sync room checks passed.')
  } catch (err) {
    console.error('\nFAIL:', err instanceof Error ? err.message : err)
    console.error('\n--- server output ---\n' + serverOutput)
    process.exitCode = 1
  } finally {
    await shutdown()
  }
}

main()
