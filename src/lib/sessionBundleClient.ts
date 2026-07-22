/**
 * Thin client-side wrapper around GET/PUT /api/sessions/:id/bundle
 * (sessionBundleRecorder.ts's endpoints, Task 11.1). Uses plain fetch()
 * rather than the hc<AppType> RPC client, matching how the sibling
 * /api/sessions/* endpoints are already consumed elsewhere (recipeStore.ts,
 * CookbookDropdown.tsx) instead of fighting Hono RPC's dynamic-segment typing.
 */

export type SessionBundleArtifact = 'poTranscript' | 'projectPlan' | 'catalog' | 'policyRules' | 'appPayload'

export interface SessionBundle {
  sessionId: string
  poTranscript: unknown
  projectPlan: string | null
  catalog: unknown
  policyRules: unknown
  appPayload: unknown
}

/** Best-effort: failures are logged but non-fatal, matching recipeStore.ts's archive pattern. */
export async function putSessionArtifact(sessionId: string, artifact: SessionBundleArtifact, content: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${window.location.origin}/api/sessions/${sessionId}/bundle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifact, content }),
    })
    if (!res.ok) console.error(`sessionBundleClient: PUT ${artifact} failed with HTTP ${res.status}`)
    return res.ok
  } catch (err) {
    console.error(`sessionBundleClient: PUT ${artifact} failed`, err)
    return false
  }
}

export async function getSessionBundle(sessionId: string): Promise<SessionBundle | null> {
  try {
    const res = await fetch(`${window.location.origin}/api/sessions/${sessionId}/bundle`)
    if (!res.ok) return null
    return (await res.json()) as SessionBundle
  } catch {
    return null
  }
}
