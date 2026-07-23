/**
 * Pass C Task 4: fires a lightweight webhook payload for high-intent visitor
 * events (a Swarm Build launch, a "Would you hire me?" feedback submission).
 * `WEBHOOK_URL` is expected to be a Discord or Slack incoming-webhook URL —
 * both accept a plain JSON POST, so one payload shape (`content` for
 * Discord, `text` for Slack, both included) covers either without picking a
 * single vendor. Unset by default: this only runs when the operator opts in
 * via `.env` (see `.env.sample`), and is always best-effort — a failed or
 * unconfigured webhook never blocks or fails the request that triggered it.
 */
const WEBHOOK_URL = process.env.WEBHOOK_URL

export function sendHighValueAlert(message: string, details: Record<string, unknown> = {}): void {
  if (!WEBHOOK_URL) return

  void fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message, text: message, ...details }),
  }).then(
    (res) => {
      if (!res.ok) console.error(`webhookNotifier: webhook responded HTTP ${res.status}`)
    },
    (err) => console.error('webhookNotifier: webhook call failed', err),
  )
}
