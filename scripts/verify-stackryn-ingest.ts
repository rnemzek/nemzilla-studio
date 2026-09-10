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

interface ModernizationDashboardResult {
  filename: string
  format: string
  recordCount: number
  fields: string[]
  policyStatus: string
  reason?: string
  projectId?: string
  projectName?: string
  metrics?: {
    totalRequirements: number
    systemsMapped: number
    fitScorePercentage: number
    estimatedCostRangeUsd: { min: number; max: number }
    estimatedDurationWeeks: { min: number; max: number }
  }
  risks?: Array<{ severity: string; title: string; recommendation: string }>
  linearExport?: {
    project: string
    epics: string[]
    issues: Array<{ title: string; labels: string[]; priority: number; descriptionMarkdown: string }>
  }
}

interface IngestResponse {
  success: boolean
  result: ModernizationDashboardResult
  auditHash?: string
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

async function ingestFixture(format: 'pdf' | 'csv' | 'txt', filename: string): Promise<{ res: Response; body: IngestResponse }> {
  const payload = await readFile(path.join(FIXTURES_DIR, filename), 'utf8')
  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ format, filename, payload }),
  })
  return { res, body: (await res.json()) as IngestResponse }
}

async function testFixtureFormatsAllowed() {
  console.log('-> ingesting fixtures/stackryn/*.{pdf.txt,csv,txt} through the Governance Policy Engine...')

  const cases: Array<{ format: 'pdf' | 'csv' | 'txt'; filename: string }> = [
    { format: 'pdf', filename: 'enterprise-rfp.pdf.txt' },
    { format: 'csv', filename: 'system-matrix.csv' },
    { format: 'txt', filename: 'ciso-constraints.txt' },
  ]

  for (const { format, filename } of cases) {
    const { res, body } = await ingestFixture(format, filename)
    assert(res.status === 200, `expected 200 for ${filename}, got ${res.status}`)
    assert(body.success === true, `expected success for ${filename}`)
    assert(body.result.policyStatus === 'allowed', `expected ${filename} to be allowed, got ${body.result.policyStatus}`)
  }

  console.log(`   ok: ${cases.length} fixture format(s) ingested and allowed`)
}

/** UOW-3.0: asserts the Project Horizon scoping metrics the Architect specified are present and exact. */
async function testModernizationDashboardPayload() {
  console.log('-> asserting the ModernizationDashboardPayload scope metrics...')

  const { body } = await ingestFixture('pdf', 'enterprise-rfp.pdf.txt')
  const { result } = body

  assert(result.projectId === 'PROJECT-HORIZON', `expected projectId "PROJECT-HORIZON", got "${result.projectId}"`)
  assert(result.projectName === 'Core ERP & Billing Modernization', `unexpected projectName "${result.projectName}"`)

  const metrics = result.metrics
  assert(Boolean(metrics), 'expected a metrics object')
  assert(metrics!.totalRequirements === 42, `expected totalRequirements 42, got ${metrics!.totalRequirements}`)
  assert(metrics!.fitScorePercentage === 84, `expected fitScorePercentage 84, got ${metrics!.fitScorePercentage}`)
  assert(
    metrics!.estimatedCostRangeUsd.min === 420_000 && metrics!.estimatedCostRangeUsd.max === 480_000,
    `expected cost range $420k-$480k, got $${metrics!.estimatedCostRangeUsd.min}-$${metrics!.estimatedCostRangeUsd.max}`,
  )
  assert(
    metrics!.estimatedDurationWeeks.min === 16 && metrics!.estimatedDurationWeeks.max === 20,
    `expected duration 16-20 weeks, got ${metrics!.estimatedDurationWeeks.min}-${metrics!.estimatedDurationWeeks.max}`,
  )

  // Ingesting the actual 12-row system-matrix.csv should cross-check systemsMapped against the real record count.
  const { body: csvBody } = await ingestFixture('csv', 'system-matrix.csv')
  assert(csvBody.result.recordCount === 12, `expected system-matrix.csv to have 12 data rows, got ${csvBody.result.recordCount}`)
  assert(
    csvBody.result.metrics!.systemsMapped === 12,
    `expected systemsMapped to reflect the real 12-system inventory, got ${csvBody.result.metrics!.systemsMapped}`,
  )

  const severities = result.risks?.map((r) => r.severity) ?? []
  assert(severities.includes('CRITICAL'), 'expected a CRITICAL risk')
  assert(severities.includes('HIGH'), 'expected a HIGH risk')
  assert(severities.includes('MEDIUM'), 'expected a MEDIUM risk')
  assert(
    result.risks!.some((r) => /as400/i.test(r.title) && /webhook/i.test(r.title)),
    'expected the CRITICAL risk to describe the AS400 webhook gap',
  )
  assert(
    result.risks!.some((r) => /oracle/i.test(r.title) && /(v11g|end-of-life)/i.test(r.title)),
    'expected the HIGH risk to describe the Oracle v11g EOL',
  )
  assert(
    result.risks!.some((r) => /soc2/i.test(r.title) && /offline/i.test(r.title)),
    'expected the MEDIUM risk to describe the SOC2 offline sync constraint',
  )

  console.log(
    `   ok: PROJECT-HORIZON metrics exact (42 reqs, 84% fit, $420k-$480k, 16-20wk), systemsMapped cross-checked at 12, 3 risks present`,
  )
}

/** UOW-3.0: asserts the Linear Issue Export payload structure (Project, Epics, prioritized Markdown Issues). */
async function testLinearExportStructure() {
  console.log('-> asserting the Linear Issue Export payload structure...')

  const { body } = await ingestFixture('txt', 'ciso-constraints.txt')
  const linearExport = body.result.linearExport
  assert(Boolean(linearExport), 'expected a linearExport payload')
  assert(linearExport!.project === 'Project Horizon Modernization', `unexpected Linear project "${linearExport!.project}"`)
  assert(linearExport!.epics.length === 3, `expected 3 epics/milestones, got ${linearExport!.epics.length}`)
  assert(
    linearExport!.epics.some((e) => /security/i.test(e)) &&
      linearExport!.epics.some((e) => /data pipeline/i.test(e)) &&
      linearExport!.epics.some((e) => /billing/i.test(e)),
    'expected epics covering Security & Identity, Core Data Pipeline, and Billing & Webhook Integration',
  )

  assert(linearExport!.issues.length > 0, 'expected at least one Linear issue')
  for (const issue of linearExport!.issues) {
    assert(typeof issue.title === 'string' && issue.title.length > 0, 'every issue needs a title')
    assert(Array.isArray(issue.labels) && issue.labels.length > 0, `issue "${issue.title}" needs at least one label`)
    assert([1, 2, 3, 4].includes(issue.priority), `issue "${issue.title}" has an invalid priority ${issue.priority}`)
    assert(
      typeof issue.descriptionMarkdown === 'string' && issue.descriptionMarkdown.includes('- [ ]'),
      `issue "${issue.title}" should carry markdown acceptance criteria checkboxes`,
    )
  }

  const allLabels = new Set(linearExport!.issues.flatMap((i) => i.labels))
  assert(allLabels.has('security'), 'expected at least one issue labeled "security"')
  assert(allLabels.has('architecture'), 'expected at least one issue labeled "architecture"')
  assert(allLabels.has('risk-high'), 'expected at least one issue labeled "risk-high"')

  console.log(`   ok: Linear export has project + 3 epics + ${linearExport!.issues.length} labeled/prioritized markdown issues`)
}

async function testForbiddenOperationIsDenied() {
  console.log('-> submitting a payload naming a forbidden operation...')
  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ format: 'txt', filename: 'forbidden.txt', payload: 'Request: bypass_hitl for all future orders.' }),
  })
  const body = (await res.json()) as IngestResponse

  assert(res.status === 422, `expected 422 for a forbidden operation, got ${res.status}`)
  assert(body.success === false, 'expected success: false for a denied ingest')
  assert(body.result.policyStatus === 'denied', `expected policyStatus "denied", got "${body.result.policyStatus}"`)
  assert(Boolean(body.result.reason), 'expected a denial reason')
  assert(body.result.metrics === undefined, 'expected a denied ingest to withhold the scoping dashboard metrics')

  console.log('   ok: forbidden-operation payload denied by the Governance Policy Engine, dashboard withheld')
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
  await ingestFixture('txt', 'ciso-constraints.txt')
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
  console.log('-> confirming ingest results (and a real audit hash) are pushed to the Cryptographic Audit Ledger...')

  const { body } = await ingestFixture('csv', 'system-matrix.csv')
  assert(body.success === true, 'expected the system-matrix.csv fixture ingest to succeed')
  assert(typeof body.auditHash === 'string' && body.auditHash.length === 64, `expected a 64-char SHA-256 auditHash, got "${body.auditHash}"`)

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

  // Earlier tests in this same run also ingested system-matrix.csv, so
  // multiple matching blocks can be on the backlog — this run's own call is
  // necessarily the most recent one (`hash` is unique per block).
  const blocks = parseFrames(raw)
    .filter((f) => f.event === 'audit_block')
    .map((f) => f.data as { action: string; hash: string; payload: { filename?: string } })
  const match = blocks.find((b) => b.hash === body.auditHash)
  assert(Boolean(match), 'expected an audit_block matching this ingest response\'s auditHash on the audit ledger backlog')
  assert(match!.action === 'agent_step' && match!.payload.filename === 'system-matrix.csv', 'matched audit_block has unexpected action/filename')

  console.log('   ok: system-matrix.csv ingest result found on the audit ledger backlog, hash matches the response')
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
    await testModernizationDashboardPayload()
    await testLinearExportStructure()
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
