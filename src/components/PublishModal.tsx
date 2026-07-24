import { Show, createSignal } from 'solid-js'
import QRCode from 'qrcode'
import { sandboxStore } from '../lib/sandboxStore.ts'
import { buildSandboxDocument } from '../lib/sandboxTemplate.ts'
import { getVisitor } from '../lib/visitorStore.ts'
import { publishApp } from '../lib/publishClient.ts'

/**
 * Plan C UOW-4: "🚀 Publish Live App" — POSTs the current preview's fully
 * envelope-wrapped HTML (the same `buildSandboxDocument()` output the
 * sandbox iframe itself renders, so the published page looks identical) to
 * `/api/publish`, then shows the resulting `/share/:slug` link as a QR code
 * (rendered as a PNG data URI — `img-src 'self' data:` already covers this
 * in the site's strict CSP, so no policy relaxation was needed for the
 * Studio side of this feature) plus a copy-link button.
 */
export default function PublishModal() {
  const [isOpen, setIsOpen] = createSignal(false)
  const [publishing, setPublishing] = createSignal(false)
  const [shareUrl, setShareUrl] = createSignal<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [copied, setCopied] = createSignal(false)

  async function handlePublish() {
    if (publishing() || sandboxStore.state.status !== 'ready') return
    setPublishing(true)
    setError(null)
    setShareUrl(null)
    setQrDataUrl(null)

    try {
      const visitor = getVisitor()
      const htmlPayload = buildSandboxDocument(sandboxStore.state.code)
      const result = await publishApp({
        title: 'AgentZ Live App',
        htmlPayload,
        visitorId: visitor.visitorId,
        handle: visitor.handle,
      })
      const fullUrl = `${window.location.origin}${result.shareUrl}`
      setShareUrl(fullUrl)
      setQrDataUrl(await QRCode.toDataURL(fullUrl, { margin: 1, width: 220 }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPublishing(false)
      setIsOpen(true)
    }
  }

  async function copyLink() {
    const url = shareUrl()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('PublishModal: clipboard write failed', err)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={sandboxStore.state.status !== 'ready' || publishing()}
        class="whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-50"
        onClick={() => void handlePublish()}
      >
        {publishing() ? 'Publishing…' : '🚀 Publish Live App'}
      </button>

      <Show when={isOpen()}>
        <div class="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={() => setIsOpen(false)}>
          <div
            class="w-full max-w-sm rounded-lg border border-border bg-surface p-5 text-center shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div class="mb-4 flex items-center justify-between border-b border-border pb-3">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-text-muted">Live App Published</h2>
              <button type="button" class="text-text-muted hover:text-text" onClick={() => setIsOpen(false)}>
                ✕
              </button>
            </div>

            <Show when={error()}>
              <p class="text-sm text-red-400">{error()}</p>
            </Show>

            <Show when={shareUrl()}>
              {(url) => (
                <>
                  <Show when={qrDataUrl()}>
                    {(qr) => (
                      <img
                        src={qr()}
                        alt="QR code linking to the published app"
                        class="mx-auto rounded-md bg-white p-2"
                        width={220}
                        height={220}
                      />
                    )}
                  </Show>
                  <p class="mt-3 break-all rounded-md border border-border bg-surface-raised px-2 py-1.5 font-mono text-xs text-text">
                    {url()}
                  </p>
                  <button
                    type="button"
                    class="mt-3 w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-accent/90"
                    onClick={() => void copyLink()}
                  >
                    {copied() ? '✅ Copied!' : '📋 Copy Link'}
                  </button>
                </>
              )}
            </Show>
          </div>
        </div>
      </Show>
    </>
  )
}
