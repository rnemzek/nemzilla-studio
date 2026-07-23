import { Show, createSignal } from 'solid-js'
import { submitFeedback, type HireAssessment } from '../lib/feedbackClient.ts'

const HIRE_OPTIONS: Array<{ value: HireAssessment; label: string; class: string }> = [
  { value: 'yes', label: '✅ Yes', class: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' },
  { value: 'needs_work', label: '🛠️ Needs Work', class: 'border-amber-500/50 bg-amber-500/10 text-amber-300' },
]

/** Pass C Task 2: a subtle "Feedback & Review" trigger + modal (comment form + hire assessment). */
export default function FeedbackModal() {
  const [isOpen, setIsOpen] = createSignal(false)
  const [comment, setComment] = createSignal('')
  const [wouldHire, setWouldHire] = createSignal<HireAssessment | null>(null)
  const [advice, setAdvice] = createSignal('')
  const [submitting, setSubmitting] = createSignal(false)
  const [resultMessage, setResultMessage] = createSignal<string | null>(null)
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null)

  function openModal() {
    setComment('')
    setWouldHire(null)
    setAdvice('')
    setResultMessage(null)
    setErrorMessage(null)
    setIsOpen(true)
  }

  async function handleSubmit(event: Event) {
    event.preventDefault()
    if (submitting()) return
    if (!comment().trim() && !wouldHire()) {
      setErrorMessage('Add a comment or pick an assessment first.')
      return
    }

    setSubmitting(true)
    setErrorMessage(null)
    try {
      const result = await submitFeedback({ comment: comment(), wouldHire: wouldHire(), advice: advice() })
      setResultMessage(
        result.githubIssueUrl ? 'Thanks! Filed as a GitHub issue and recorded.' : 'Thanks — your feedback was recorded.',
      )
      setTimeout(() => setIsOpen(false), 1200)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        class="whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1.5 text-xs text-text-muted transition-colors hover:border-accent hover:text-text sm:px-3"
        onClick={openModal}
      >
        <span aria-hidden="true">💬</span> <span class="hidden sm:inline">Feedback & Review</span>
      </button>

      <Show when={isOpen()}>
        <div class="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={() => setIsOpen(false)}>
          <div
            class="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div class="mb-4 flex items-center justify-between border-b border-border pb-3">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-text-muted">Feedback & Review</h2>
              <button type="button" class="text-text-muted hover:text-text" onClick={() => setIsOpen(false)}>
                ✕
              </button>
            </div>

            <form class="space-y-4" onSubmit={handleSubmit}>
              <label class="block text-sm text-text-muted">
                Comment or issue
                <textarea
                  value={comment()}
                  onInput={(event) => setComment(event.currentTarget.value)}
                  rows={3}
                  maxLength={2000}
                  class="mt-1 w-full rounded-md border border-border bg-surface-raised p-2 text-sm text-text"
                  placeholder="Found a bug? Have a suggestion? Say it here."
                />
              </label>

              <div>
                <p class="mb-2 text-sm text-text-muted">Would you hire/partner with me based on this build?</p>
                <div class="flex gap-2">
                  {HIRE_OPTIONS.map((opt) => (
                    <button
                      type="button"
                      class={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        wouldHire() === opt.value ? opt.class : 'border-border text-text-muted hover:border-accent'
                      }`}
                      onClick={() => setWouldHire((current) => (current === opt.value ? null : opt.value))}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <Show when={wouldHire()}>
                <label class="block text-sm text-text-muted">
                  Any advice? (optional)
                  <textarea
                    value={advice()}
                    onInput={(event) => setAdvice(event.currentTarget.value)}
                    rows={2}
                    maxLength={1000}
                    class="mt-1 w-full rounded-md border border-border bg-surface-raised p-2 text-sm text-text"
                    placeholder="What would make this a clear yes?"
                  />
                </label>
              </Show>

              <button
                type="submit"
                disabled={submitting()}
                class="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {submitting() ? 'Sending…' : 'Submit Feedback'}
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
