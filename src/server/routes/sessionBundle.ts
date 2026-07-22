import type { Context } from 'hono'
import {
  isValidAppPayload,
  isValidCatalog,
  isValidPoTranscript,
  isValidPolicyRules,
  isValidSessionId,
  readSessionBundle,
  writeAppPayload,
  writeCatalog,
  writePoTranscript,
  writePolicyRules,
  writeProjectPlan,
  type ArtifactKey,
} from '../services/sessionBundleRecorder.ts'

const ARTIFACT_KEY_SET: Set<string> = new Set(['poTranscript', 'projectPlan', 'catalog', 'policyRules', 'appPayload'])
const MAX_CONTENT_LENGTH = 200_000

export async function getSessionBundleHandler(c: Context) {
  const sessionId = c.req.param('id')
  if (!sessionId || !isValidSessionId(sessionId)) return c.json({ error: 'invalid session id' }, 400)
  const bundle = await readSessionBundle(sessionId)
  if (!bundle) return c.json({ error: 'bundle not found' }, 404)
  return c.json(bundle)
}

export async function putSessionBundleArtifactHandler(c: Context) {
  const sessionId = c.req.param('id')
  if (!sessionId || !isValidSessionId(sessionId)) return c.json({ error: 'invalid session id' }, 400)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const { artifact, content } = (body ?? {}) as { artifact?: string; content?: unknown }
  if (typeof artifact !== 'string' || !ARTIFACT_KEY_SET.has(artifact)) {
    return c.json({ error: 'invalid artifact key' }, 400)
  }
  if (content === undefined || JSON.stringify(content).length > MAX_CONTENT_LENGTH) {
    return c.json({ error: 'missing or oversized content' }, 400)
  }

  const key = artifact as ArtifactKey
  switch (key) {
    case 'poTranscript':
      if (!isValidPoTranscript(content)) return c.json({ error: 'invalid poTranscript shape' }, 400)
      await writePoTranscript(sessionId, content)
      break
    case 'projectPlan':
      if (typeof content !== 'string') return c.json({ error: 'projectPlan must be a string' }, 400)
      await writeProjectPlan(sessionId, content)
      break
    case 'catalog':
      if (!isValidCatalog(content)) return c.json({ error: 'invalid catalog shape' }, 400)
      await writeCatalog(sessionId, content)
      break
    case 'policyRules':
      if (!isValidPolicyRules(content)) return c.json({ error: 'invalid policyRules shape' }, 400)
      await writePolicyRules(sessionId, content)
      break
    case 'appPayload':
      if (!isValidAppPayload(content)) return c.json({ error: 'invalid appPayload shape' }, 400)
      await writeAppPayload(sessionId, content)
      break
  }

  return c.json({ success: true, sessionId, artifact: key })
}
