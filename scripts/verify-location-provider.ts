import { spawn } from 'node:child_process'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const PORT = Number(process.env.TEST_PORT ?? 4192)
const BASE_URL = `http://127.0.0.1:${PORT}`
const HEALTH_URL = `${BASE_URL}/api/health`
const STREAM_URL = `${BASE_URL}/api/agent/stream`

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

async function fetchGeneratedCode(query: string): Promise<string> {
  const res = await fetch(`${STREAM_URL}?${query}`)
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
  assert(payloadFrames.length > 0, 'expected at least one generated_app_payload frame')
  const final = payloadFrames.at(-1)!.data as { code: string; done: boolean }
  assert(final.done === true, 'final generated_app_payload frame should have done: true')
  return final.code
}

/** UOW-6.1: the Unified Itinerary snippet (appGeneratorPrompt.ts), reached via ?prompt=. */
async function testTemplatePreviewLocationProvider() {
  console.log('-> checking the ?prompt=Today Itinerary generated app for the location provider...')
  const code = await fetchGeneratedCode(new URLSearchParams({ prompt: 'Today Itinerary' }).toString())

  assert(code.includes('id="location-badge"'), 'expected a location badge in the generated markup')
  assert(code.includes('id="location-modal"'), 'expected a location (zip entry) modal in the generated markup')
  assert(code.includes('id="location-zip-input"'), 'expected a zip code input in the location modal')
  assert(code.includes('94103'), 'expected the default San Francisco zip (94103) fallback')
  assert(code.includes('nemzilla-location-state'), 'expected the location localStorage key')
  assert(code.includes('navigator.geolocation') || code.includes("'geolocation' in navigator"), 'expected an HTML5 Geolocation API call')
  assert(code.includes('nemzilla:sandbox-location-state'), 'expected the location postMessage relay type')
  assert(code.includes('attachLocationToTaskEvent'), 'expected location metadata attached to task events')

  console.log('   ok: template-preview TODO app includes the zip/geolocation provider, badge, and modal')
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
    await testTemplatePreviewLocationProvider()
    console.log('\nAll location provider checks passed.')
  } catch (err) {
    console.error('\nFAIL:', err instanceof Error ? err.message : err)
    console.error('\n--- server output ---\n' + serverOutput)
    process.exitCode = 1
  } finally {
    await shutdown()
  }
}

main()
