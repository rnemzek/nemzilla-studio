import { For, Show, createEffect, createSignal, onMount } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { runCommand, type OutputKind } from '../lib/terminalCommands.ts'
import RnAvatar from './RnAvatar.tsx'

interface TerminalLine {
  id: number
  kind: OutputKind
  text: string
}

let nextLineId = 0

const WELCOME_LINES: Array<[string, OutputKind]> = [
  ['NemZilla Studio — nemzilla-cli', 'system'],
  ['Type "help" to see available commands.', 'system'],
]

function kindClass(kind: OutputKind) {
  switch (kind) {
    case 'input':
      return 'text-text'
    case 'error':
      return 'text-red-400'
    case 'system':
    case 'po':
      return 'text-accent'
    default:
      return 'text-text-muted'
  }
}

export default function Terminal() {
  const [lines, setLines] = createStore<TerminalLine[]>(
    WELCOME_LINES.map(([text, kind]) => ({ id: nextLineId++, kind, text })),
  )
  const [input, setInput] = createSignal('')
  const [history, setHistory] = createSignal<string[]>([])
  const [historyIndex, setHistoryIndex] = createSignal<number | null>(null)
  const [isRunning, setIsRunning] = createSignal(false)

  let inputRef: HTMLInputElement | undefined
  let scrollRef: HTMLDivElement | undefined

  const print = (text: string, kind: OutputKind = 'output') => {
    setLines(
      produce((draft) => {
        draft.push({ id: nextLineId++, kind, text })
      }),
    )
  }

  const clear = () => setLines([])

  createEffect(() => {
    lines.length
    if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight
  })

  onMount(() => inputRef?.focus())

  const submit = async () => {
    const value = input()
    if (!value.trim() || isRunning()) return

    print(`$ ${value}`, 'input')
    setHistory((prev) => [...prev, value])
    setHistoryIndex(null)
    setInput('')

    setIsRunning(true)
    try {
      await runCommand(value, { print, clear })
    } catch (err) {
      print(`error: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setIsRunning(false)
      inputRef?.focus()
    }
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void submit()
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const past = history()
      if (past.length === 0) return
      const current = historyIndex()
      const nextIndex = current === null ? past.length - 1 : Math.max(0, current - 1)
      setHistoryIndex(nextIndex)
      setInput(past[nextIndex]!)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const past = history()
      const current = historyIndex()
      if (current === null) return
      const nextIndex = current + 1
      if (nextIndex >= past.length) {
        setHistoryIndex(null)
        setInput('')
      } else {
        setHistoryIndex(nextIndex)
        setInput(past[nextIndex]!)
      }
    }
  }

  return (
    <section
      data-testid="terminal"
      class="w-full max-w-2xl rounded-lg border border-border bg-surface text-left font-mono text-sm shadow-lg"
      onClick={() => inputRef?.focus()}
    >
      <div class="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-text-muted">
        <span class="h-2.5 w-2.5 rounded-full bg-red-500/70" />
        <span class="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
        <span class="h-2.5 w-2.5 rounded-full bg-green-500/70" />
        <span class="ml-2">nemzilla-cli</span>
      </div>

      <div ref={scrollRef} class="max-h-80 overflow-y-auto px-4 py-3">
        <For each={lines}>
          {(line) => (
            <Show
              when={line.kind === 'po'}
              fallback={<p class={`whitespace-pre-wrap ${kindClass(line.kind)}`}>{line.text}</p>}
            >
              <p class={`flex items-start gap-2 whitespace-pre-wrap ${kindClass(line.kind)}`}>
                <RnAvatar size={16} class="mt-0.5 shrink-0" />
                <span>
                  <span class="font-semibold">AI PO:</span> {line.text}
                </span>
              </p>
            </Show>
          )}
        </For>
      </div>

      <div class="flex items-center gap-2 border-t border-border px-4 py-2">
        <span class="text-accent">$</span>
        <input
          ref={inputRef}
          type="text"
          class="flex-1 bg-transparent text-text outline-none placeholder:text-text-muted"
          placeholder={isRunning() ? 'running…' : 'type a command…'}
          value={input()}
          disabled={isRunning()}
          onInput={(event) => setInput(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </section>
  )
}
