/**
 * Thin client wrapper around POST /api/publish, matching sessionBundleClient.ts's
 * plain-fetch pattern for POST-body-driven routes.
 */
export interface PublishAppInput {
  title: string
  htmlPayload: string
  slug?: string
  visitorId?: string
  handle?: string
}

export interface PublishAppResult {
  slug: string
  shareUrl: string
}

export async function publishApp(input: PublishAppInput): Promise<PublishAppResult> {
  const res = await fetch(`${window.location.origin}/api/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as PublishAppResult
}
