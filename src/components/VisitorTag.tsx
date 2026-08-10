import { Show, createSignal, onCleanup, onMount } from 'solid-js'
import { visitorState, setHandle, initVisitor } from '../lib/visitorStore.ts'

/** Pass C Task 1: the small editable "Observer: [ Handle ] ✏️" tag in the header. */
export default function VisitorTag() {
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal('')
  let inputRef: HTMLInputElement | undefined

  onMount(() => {
    const disconnect = initVisitor()
    onCleanup(disconnect)
  })

  function startEditing() {
    setDraft(visitorState.identity?.handle ?? '')
    setEditing(true)
    setTimeout(() => inputRef?.focus(), 0)
  }

  function commit() {
    const value = draft().trim()
    if (value) setHandle(value)
    setEditing(false)
  }

  return (
    <Show when={visitorState.identity}>
      {(identity) => (
        <span class="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2 py-1.5 font-mono text-[11px] text-text-muted">
          <span>Observer:</span>
          <Show
            when={editing()}
            fallback={
              <>
                <span class="text-text">[ {identity().handle} ]</span>
                <button
                  type="button"
                  class="inline-flex h-4 w-4 shrink-0 items-center justify-center gap-1.5 text-orange-400 transition-colors hover:text-accent"
                  aria-label="Edit observer handle"
                  onClick={startEditing}
                >
                  <svg
                    viewBox="0 0 24 24"
                    class="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </>
            }
          >
            <input
              ref={inputRef}
              type="text"
              value={draft()}
              maxLength={60}
              class="w-32 rounded border border-accent/50 bg-bg px-1 py-0.5 text-text outline-none"
              onInput={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit()
                else if (event.key === 'Escape') setEditing(false)
              }}
              onBlur={commit}
            />
          </Show>
        </span>
      )}
    </Show>
  )
}
