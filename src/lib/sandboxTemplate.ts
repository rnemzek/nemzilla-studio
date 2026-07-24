export const SANDBOX_FRAME_PATH = '/sandbox-frame'

/** postMessage protocol between the parent shell and the sandboxed iframe. */
export const SANDBOX_MESSAGE = {
  ready: 'nemzilla:sandbox-ready',
  code: 'nemzilla:sandbox-code',
  rendered: 'nemzilla:sandbox-rendered',
  error: 'nemzilla:sandbox-error',
  /** UOW-11 Task 11.6: a generated order-entry app reports each order decision (auto/HITL approve/deny) here — see sandboxStore.ts and swarmCodeSynthesizer.ts. */
  order: 'nemzilla:sandbox-order-decision',
  /**
   * Pass E "Plan C": the Unified Itinerary snippet's checkbox state, relayed
   * through the parent rather than written to `localStorage` *inside* the
   * iframe. The sandbox is deliberately `sandbox="allow-scripts"` with
   * `allow-same-origin` omitted (see sandboxFrame.ts's route comment) — per
   * the HTML sandboxing spec, that gives the document a fresh, unique opaque
   * origin on every load, so anything the child wrote to its own
   * `localStorage` would already be unreachable the next time this same app
   * is generated, defeating "persists across refreshes" entirely (and some
   * browsers throw accessing storage from an opaque origin at all). The
   * parent page has a real, stable origin and already relays the order-
   * decision postMessage the same way (see `order` above) — this reuses that
   * established pattern instead of weakening the sandbox to grant
   * `allow-same-origin`, which would also hand the generated app real access
   * to the host site's own cookies/storage.
   */
  itineraryState: 'nemzilla:sandbox-itinerary-state',
  /** Parent -> child: sent once after `rendered`, with whatever was previously saved via `itineraryState`, so the child can re-check its own boxes. */
  restoreItineraryState: 'nemzilla:sandbox-restore-itinerary-state',
} as const

/**
 * Wraps a generated app snippet (arbitrary HTML/CSS/Tailwind/JS) with a full
 * HTML5 envelope: Tailwind's CDN build, Inter font, and a window-level error
 * boundary that reports uncaught exceptions/rejections back to the parent
 * over postMessage instead of leaving the sandboxed document silently blank.
 * The result is handed to the `/sandbox-frame` shim via postMessage, which
 * writes it into the iframe with `document.write` (see sandboxStore.ts).
 */
export function buildSandboxDocument(snippet: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
    </style>
    <script>
      window.addEventListener('error', function (event) {
        window.parent.postMessage(
          { type: '${SANDBOX_MESSAGE.error}', message: event.message || 'Unknown runtime error' },
          '*',
        )
      })
      window.addEventListener('unhandledrejection', function (event) {
        window.parent.postMessage(
          { type: '${SANDBOX_MESSAGE.error}', message: String(event.reason) },
          '*',
        )
      })
    </script>
  </head>
  <body>
    ${snippet}
  </body>
</html>`
}
