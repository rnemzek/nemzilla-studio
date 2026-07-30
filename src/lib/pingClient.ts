/**
 * Thin client wrapper around POST /api/ping, matching feedbackClient.ts's
 * plain-fetch pattern for POST-body-driven routes.
 */
import { getVisitor } from './visitorStore.ts'

export async function sendPing(message: string): Promise<void> {
  const visitor = getVisitor()
  const res = await fetch(`${window.location.origin}/api/ping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message.trim(),
      sessionId: visitor.visitorId === 'pending' ? undefined : visitor.visitorId,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }
}
