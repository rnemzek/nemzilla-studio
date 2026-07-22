export const SANDBOX_FRAME_PATH = '/sandbox-frame'

/** postMessage protocol between the parent shell and the sandboxed iframe. */
export const SANDBOX_MESSAGE = {
  ready: 'nemzilla:sandbox-ready',
  code: 'nemzilla:sandbox-code',
  rendered: 'nemzilla:sandbox-rendered',
  error: 'nemzilla:sandbox-error',
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
