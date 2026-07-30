import { Show, createSignal } from 'solid-js'
import { sendPing } from '../lib/pingClient.ts'

const MAX_MESSAGE_LENGTH = 1000

/** "Ping Dev" — a direct, unstructured line to the operator's webhook (see webhookNotifier.ts), distinct from FeedbackModal's structured comment/hire-assessment flow. */
export default function PingDevModal() {
  const [isOpen, setIsOpen] = createSignal(false)
  const [message, setMessage] = createSignal('')
  const [sending, setSending] = createSignal(false)
  const [resultMessage, setResultMessage] = createSignal<string | null>(null)
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null)

  function openModal() {
    setMessage('')
    setResultMessage(null)
    setErrorMessage(null)
    setIsOpen(true)
  }

  async function handleSubmit(event: Event) {
    event.preventDefault()
    if (sending()) return
    if (!message().trim()) {
      setErrorMessage('Write something first.')
      return
    }

    setSending(true)
    setErrorMessage(null)
    try {
      await sendPing(message())
      setResultMessage('Sent!')
      setTimeout(() => setIsOpen(false), 1000)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        class="whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-text sm:px-3"
        onClick={openModal}
      >
        <span aria-hidden="true">📡</span> <span class="hidden sm:inline">Ping Dev</span>
      </button>

      <Show when={isOpen()}>
        <div class="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={() => setIsOpen(false)}>
          <div
            class="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div class="mb-4 flex items-center justify-between border-b border-border pb-3">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-text-muted">Ping Dev</h2>
              <button type="button" class="text-text-muted hover:text-text" onClick={() => setIsOpen(false)}>
                ✕
              </button>
            </div>

            <form class="space-y-4" onSubmit={handleSubmit}>
              <label class="block text-sm text-text-muted">
                Message
                <textarea
                  value={message()}
                  onInput={(event) => setMessage(event.currentTarget.value)}
                  rows={3}
                  maxLength={MAX_MESSAGE_LENGTH}
                  class="mt-1 w-full rounded-md border border-border bg-surface-raised p-2 text-sm text-text"
                  placeholder="Something broken? Something cool? Send it straight to the dev."
                />
              </label>

              <button
                type="submit"
                disabled={sending()}
                class="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {sending() ? 'Sending…' : 'Send Ping'}
              </button>

              <Show when={resultMessage()}>
                <p class="text-center text-xs text-emerald-400">{resultMessage()}</p>
              </Show>
              <Show when={errorMessage()}>
                <p class="text-center text-xs text-red-400">{errorMessage()}</p>
              </Show>
            </form>
          </div>
        </div>
      </Show>
    </>
  )
}
