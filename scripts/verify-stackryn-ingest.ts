import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const PORT = Number(process.env.TEST_PORT ?? 4189)
const BASE_URL = `http://127.0.0.1:${PORT}`
const HEALTH_URL = `${BASE_URL}/api/health`
const INGEST_URL = `${BASE_URL}/api/stackryn/ingest`
const STREAM_URL = `${BASE_URL}/api/agent/stream`
const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'stackryn')

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

async function ingestFixture(format: 'pdf' | 'csv' | 'txt', filename: string) {
  const payload = await readFile(path.join(FIXTURES_DIR, filename), 'utf8')
  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ format, filename, payload }),
  })
  return { res, body: (await res.json()) as { success: boolean; result: { policyStatus: string } } }
}

async function testFixtureFormatsAllowed() {
  console.log('-> ingesting fixtures/stackryn/*.{pdf.txt,csv,txt} through the Governance Policy Engine...')

  const cases: Array<{ format: 'pdf' | 'csv' | 'txt'; filename: string }> = [
    { format: 'pdf', filename: 'sample.pdf.txt' },
    { format: 'csv', filename: 'sample.csv' },
    { format: 'txt', filename: 'sample.txt' },
  ]

  for (const { format, filename } of cases) {
    const { res, body } = await ingestFixture(format, filename)
    assert(res.status === 200, `expected 200 for ${filename}, got ${res.status}`)
    assert(body.success === true, `expected success for ${filename}`)
    assert(body.result.policyStatus === 'allowed', `expected ${filename} to be allowed, got ${body.result.policyStatus}`)
  }

  console.log(`   ok: ${cases.length} fixture format(s) ingested and allowed`)
}

async function testForbiddenOperationIsDenied() {
  console.log('-> submitting a payload naming a forbidden operation...')
  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ format: 'txt', filename: 'forbidden.txt', payload: 'Request: bypass_hitl for all future orders.' }),
  })
  const body = (await res.json()) as { success: boolean; result: { policyStatus: string; reason?: string } }

  assert(res.status === 422, `expected 422 for a forbidden operation, got ${res.status}`)
  assert(body.success === false, 'expected success: false for a denied ingest')
  assert(body.result.policyStatus === 'denied', `expected policyStatus "denied", got "${body.result.policyStatus}"`)
  assert(Boolean(body.result.reason), 'expected a denial reason')

  console.log('   ok: forbidden-operation payload denied by the Governance Policy Engine')
}

async function testInvalidRequestsRejected() {
  console.log('-> checking malformed requests are rejected before governance runs...')

  const missingFormat = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: 'x.txt', payload: 'hello' }),
  })
  assert(missingFormat.status === 400, `expected 400 for missing format, got ${missingFormat.status}`)

  const badJson = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  })
  assert(badJson.status === 400, `expected 400 for invalid JSON, got ${badJson.status}`)

  console.log('   ok: missing-format and malformed-JSON requests both rejected with 400')
}

async function testBroadcastsOverAgentStream() {
  console.log('-> confirming ingest steps broadcast over /api/agent/stream...')

  const controller = new AbortController()
  const res = await fetch(STREAM_URL, { signal: controller.signal })
  assert(res.ok, `expected 200 from stream, got ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()

  // The stream connection itself claims the "builder" role and starts the
  // classic demo pipeline running concurrently — irrelevant here, we're only
  // checking that this ingest call's own agent_step frames also land on the
  // shared broadcast. Give the classic pipeline's first frames a moment to
  // clear so we don't race the ingest call's frames into the same read.
  await delay(50)
  await ingestFixture('txt', 'sample.txt')
  await delay(200)

  let raw = ''
  const readDeadline = Date.now() + 2000
  while (Date.now() < readDeadline) {
    const { done, value } = await Promise.race([reader.read(), delay(100).then(() => ({ done: false, value: undefined }))])
    if (done) break
    if (value) raw += decoder.decode(value, { stream: true })
  }
  controller.abort()
  await reader.cancel().catch(() => {})

  const frames = parseFrames(raw)
  const ingestFrames = frames.filter((f) => f.event === 'agent_step' && (f.data as { agent?: string }).agent === 'Stackryn Ingest')
  const states = ingestFrames.map((f) => (f.data as { state: string }).state)

  assert(states.includes('PLANNING'), 'expected a PLANNING frame from the ingest call')
  assert(states.includes('PARSING'), 'expected a PARSING frame from the ingest call')
  assert(states.includes('EVALUATING'), 'expected an EVALUATING frame from the ingest call')
  assert(states.includes('DONE'), 'expected a DONE frame from the ingest call')

  console.log(`   ok: observed ${ingestFrames.length} Stackryn Ingest agent_step frame(s) (${states.join(' -> ')}) on /api/agent/stream`)
}

async function testAuditedToLedger() {
  console.log('-> confirming ingest results are pushed to the Cryptographic Audit Ledger...')

  const { body } = await ingestFixture('csv', 'sample.csv')
  assert(body.success === true, 'expected the csv fixture ingest to succeed')

  // The audit daemon drains asynchronously (setImmediate) — give it a beat.
  await delay(100)

  const res = await fetch(`${BASE_URL}/api/audit/stream`)
  assert(res.ok, `expected 200 from audit stream, got ${res.status}`)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  const readDeadline = Date.now() + 1000
  while (Date.now() < readDeadline) {
    const { done, value } = await Promise.race([reader.read(), delay(100).then(() => ({ done: false, value: undefined }))])
    if (done) break
    if (value) raw += decoder.decode(value, { stream: true })
  }
  await reader.cancel().catch(() => {})

  const blocks = parseFrames(raw)
    .filter((f) => f.event === 'audit_block')
    .map((f) => f.data as { action: string; payload: { filename?: string } })
  const match = blocks.find((b) => b.action === 'agent_step' && b.payload.filename === 'sample.csv')
  assert(Boolean(match), 'expected an audit_block for sample.csv on the audit ledger backlog')

  console.log('   ok: sample.csv ingest result found on the audit ledger backlog')
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
    await testFixtureFormatsAllowed()
    await testForbiddenOperationIsDenied()
    await testInvalidRequestsRejected()
    await testBroadcastsOverAgentStream()
    await testAuditedToLedger()
    console.log('\nAll Stackryn ingest checks passed.')
  } catch (err) {
    console.error('\nFAIL:', err instanceof Error ? err.message : err)
    console.error('\n--- server output ---\n' + serverOutput)
    process.exitCode = 1
  } finally {
    await shutdown()
  }
}

main()
