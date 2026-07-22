import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Context } from 'hono'

const BIBLE_PATH = path.join(process.cwd(), '.codex', 'AGENTZ-STUDIO-SDK.md')

/**
 * Serves .codex/AGENTZ-STUDIO-SDK.md fresh off disk on every request rather
 * than bundling it into the client build — this doc keeps getting updated
 * UOW over UOW, and a build-time `?raw` import would show stale content in
 * a running production server until the next rebuild/redeploy.
 */
export async function getBibleHandler(c: Context) {
  try {
    const content = await readFile(BIBLE_PATH, 'utf8')
    return c.json({ content })
  } catch {
    return c.json({ error: 'AgentZ Bible not found' }, 404)
  }
}
