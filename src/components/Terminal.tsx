import { For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { runCommand, SLASH_COMMANDS, type OutputKind, type SlashCommandInfo } from '../lib/terminalCommands.ts'
import { interviewState } from '../lib/interviewStore.ts'
import { visitorState } from '../lib/visitorStore.ts'
import RnAvatar from './RnAvatar.tsx'

interface TerminalLine {
  id: number
  kind: OutputKind
  text: string
}

let nextLineId = 0

const WELCOME_LINES: Array<[string, OutputKind]> = [
  ['Type "/" to see available commands, or just tell me what you want to build.', 'system'],
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
  const [minimized, setMinimized] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)
  const [paletteIndex, setPaletteIndex] = createSignal(0)

  let inputRef: HTMLTextAreaElement | undefined
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

  /**
   * Pass D: the "/" command palette. Shown only while the user is still
   * typing the command name itself (no space/newline yet) — once they start
   * typing args, or the text doesn't start with "/", the palette hides.
   */
  const showPalette = createMemo(() => {
    const v = input()
    return v.startsWith('/') && !v.includes(' ') && !v.includes('\n')
  })
  const filteredCommands = createMemo<SlashCommandInfo[]>(() => {
    const query = input().slice(1).toLowerCase()
    return SLASH_COMMANDS.filter((c) => c.name.startsWith(query))
  })

  function autoGrow() {
    if (!inputRef) return
    inputRef.style.height = 'auto'
    inputRef.style.height = `${inputRef.scrollHeight}px`
  }

  const runValue = async (value: string) => {
    if (!value.trim() || isRunning()) return

    print(`> ${value}`, 'input')
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

  const submit = async () => {
    const value = input()
    if (!value.trim() || isRunning()) return

    setHistory((prev) => [...prev, value])
    setHistoryIndex(null)
    setInput('')
    requestAnimationFrame(autoGrow)
    await runValue(value)
  }

  /** Pass A: the "Build" CTA below the prompt — fires the same launch path as typing "build"/"andiamo" once the AI PO interview is done. */
  const triggerBuildCta = () => runValue('/andiamo')

  function selectPaletteCommand(cmd: SlashCommandInfo) {
    setInput(`/${cmd.name} `)
    setPaletteIndex(0)
    inputRef?.focus()
    requestAnimationFrame(autoGrow)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (showPalette() && filteredCommands().length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setPaletteIndex((i) => (i + 1) % filteredCommands().length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setPaletteIndex((i) => (i - 1 + filteredCommands().length) % filteredCommands().length)
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        selectPaletteCommand(filteredCommands()[paletteIndex()]!)
        return
      }
      if (event.key === 'Enter') {
        const match = filteredCommands()[paletteIndex()]!
        // Already typed the complete command name (e.g. "/template") — let
        // this Enter submit normally (falls through below) instead of
        // re-completing it into the input again, which would otherwise
        // require a second Enter press to actually run anything.
        if (input().slice(1).toLowerCase() !== match.name) {
          event.preventDefault()
          selectPaletteCommand(match)
          return
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setInput('')
        return
      }
    }

    // Multiline input: Shift+Enter inserts a newline (native textarea
    // behavior) instead of submitting.
    if (event.key === 'Enter' && event.shiftKey) {
      requestAnimationFrame(autoGrow)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      void submit()
      return
    }

    // History recall only applies to single-line input — once there's a
    // newline in the box, arrow keys should move the cursor natively rather
    // than hijacking multiline editing.
    if (input().includes('\n')) return

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const past = history()
      if (past.length === 0) return
      const current = historyIndex()
      const nextIndex = current === null ? past.length - 1 : Math.max(0, current - 1)
      setHistoryIndex(nextIndex)
      setInput(past[nextIndex]!)
      requestAnimationFrame(autoGrow)
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
      requestAnimationFrame(autoGrow)
    }
  }

  return (
    <section
      data-testid="terminal"
      class="w-full max-w-2xl rounded-lg border border-border bg-surface text-left font-mono text-sm shadow-lg"
      onClick={() => inputRef?.focus()}
    >
      <div class="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-text-muted">
        <button
          type="button"
          aria-label="Reset session"
          title="Reset session"
          class="h-2.5 w-2.5 rounded-full bg-red-500/70 transition-colors hover:bg-red-500"
          onClick={(event) => {
            event.stopPropagation()
            void runValue('/reset')
          }}
        />
        <button
          type="button"
          aria-label={minimized() ? 'Restore AgentZ' : 'Minimize AgentZ'}
          title={minimized() ? 'Restore AgentZ' : 'Minimize AgentZ'}
          class="h-2.5 w-2.5 rounded-full bg-yellow-500/70 transition-colors hover:bg-yellow-500"
          onClick={(event) => {
            event.stopPropagation()
            setMinimized((v) => !v)
          }}
        />
        <button
          type="button"
          aria-label={expanded() ? 'Collapse AgentZ' : 'Expand AgentZ'}
          title={expanded() ? 'Collapse AgentZ' : 'Expand AgentZ'}
          class="h-2.5 w-2.5 rounded-full bg-green-500/70 transition-colors hover:bg-green-500"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded((v) => !v)
          }}
        />
        <span class="ml-2">AgentZ</span>
      </div>

      <Show when={!minimized()}>
        <div
          ref={scrollRef}
          class={`overflow-y-auto px-4 py-3 transition-[max-height] duration-200 ${expanded() ? 'max-h-[36rem]' : 'max-h-80'}`}
        >
          <p class="whitespace-pre-wrap text-accent">
            Welcome, {visitorState.identity?.handle ?? 'friend'}! What would you like to build today?
          </p>
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

        <Show when={interviewState.interview?.done}>
          <div class="border-t border-border px-4 py-2">
            <button
              type="button"
              disabled={isRunning()}
              class="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-accent/90 disabled:opacity-50"
              onClick={(event) => {
                event.stopPropagation()
                void triggerBuildCta()
              }}
            >
              Ready to build your app? Click Build
            </button>
          </div>
        </Show>

        <div class="relative flex items-start gap-2 border-t border-border px-4 py-2">
          <Show when={showPalette() && filteredCommands().length > 0}>
            <div class="absolute inset-x-4 bottom-full z-10 mb-1 overflow-hidden rounded-md border border-border bg-surface-raised shadow-xl">
              <For each={filteredCommands()}>
                {(cmd, i) => (
                  <button
                    type="button"
                    class={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors ${
                      paletteIndex() === i() ? 'bg-accent/15 text-text' : 'text-text-muted hover:bg-surface hover:text-text'
                    }`}
                    onMouseEnter={() => setPaletteIndex(i())}
                    onClick={(event) => {
                      event.stopPropagation()
                      selectPaletteCommand(cmd)
                    }}
                  >
                    <span class="font-medium text-accent">{cmd.usage}</span>
                    <span class="truncate text-text-muted">{cmd.description}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>

          <span class="mt-0.5 text-accent" aria-hidden="true">✨</span>
          <textarea
            ref={inputRef}
            rows={1}
            class="max-h-32 flex-1 resize-none overflow-y-auto bg-transparent text-text outline-none placeholder:text-text-muted"
            placeholder={isRunning() ? 'running…' : 'Ask AgentZ or type / for commands...'}
            value={input()}
            disabled={isRunning()}
            onInput={(event) => {
              setInput(event.currentTarget.value)
              setPaletteIndex(0)
              autoGrow()
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
      </Show>
    </section>
  )
}
