import { Show, createSignal, type JSX } from 'solid-js'

interface PanelHelpButtonProps {
  title: string
  children: JSX.Element
}

/**
 * A sleek "?" trigger + lightweight popover, reused across each of the four
 * main Studio panels (Swarm Canvas, AgentZ Chat, App Preview, Audit Ledger)
 * to explain what that specific panel does without needing a full modal.
 * Same fixed-inset-0-click-outside-to-close shape `CookbookDropdown.tsx`
 * already uses for its own popover, just anchored top-right instead of a
 * dropdown list.
 */
export default function PanelHelpButton(props: PanelHelpButtonProps) {
  const [open, setOpen] = createSignal(false)

  return (
    <div class="relative shrink-0">
      <button
        type="button"
        aria-label={`About ${props.title}`}
        title={`About ${props.title}`}
        class="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-text-muted transition-colors hover:border-accent hover:text-accent"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        ?
      </button>
      <Show when={open()}>
        <div class="fixed inset-0 z-20" onClick={() => setOpen(false)} />
        <div
          class="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-border bg-surface p-3 text-left text-xs leading-relaxed text-text-muted shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <p class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text">{props.title}</p>
          {props.children}
        </div>
      </Show>
    </div>
  )
}
