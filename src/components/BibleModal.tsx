import { For, Show, createResource, createSignal, type JSX } from 'solid-js'
import { parseInline, parseMarkdown, type MarkdownBlock } from '../lib/markdown.ts'

const SAFE_HREF = /^(https?:\/\/|\/|#)/i

function renderInline(text: string): JSX.Element[] {
  return parseInline(text).map((node) => {
    switch (node.type) {
      case 'bold':
        return <strong class="font-semibold text-text">{node.value}</strong>
      case 'code':
        return <code class="rounded bg-surface-raised px-1 py-0.5 font-mono text-xs text-accent">{node.value}</code>
      case 'link':
        return SAFE_HREF.test(node.href) ? (
          <a href={node.href} target="_blank" rel="noopener noreferrer" class="text-accent underline">
            {node.text}
          </a>
        ) : (
          <>{node.text}</>
        )
      default:
        return <>{node.value}</>
    }
  })
}

function BibleBlock(props: { block: MarkdownBlock }) {
  const block = props.block
  switch (block.type) {
    case 'heading':
      if (block.level === 1) return <h1 class="mt-5 text-xl font-bold text-text first:mt-0">{renderInline(block.text)}</h1>
      if (block.level === 2) return <h2 class="mt-5 text-lg font-semibold text-text">{renderInline(block.text)}</h2>
      return <h3 class="mt-4 text-base font-semibold text-text">{renderInline(block.text)}</h3>
    case 'hr':
      return <hr class="border-border" />
    case 'code':
      return (
        <pre class="overflow-x-auto rounded-md border border-border bg-surface-raised p-3 font-mono text-xs text-text">
          <code>{block.content}</code>
        </pre>
      )
    case 'list':
      return block.ordered ? (
        <ol class="list-decimal space-y-1 pl-5">
          <For each={block.items}>{(item) => <li>{renderInline(item)}</li>}</For>
        </ol>
      ) : (
        <ul class="list-disc space-y-1 pl-5">
          <For each={block.items}>{(item) => <li>{renderInline(item)}</li>}</For>
        </ul>
      )
    case 'table':
      return (
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-xs">
            <thead>
              <tr>
                <For each={block.headers}>
                  {(header) => <th class="border-b border-border px-2 py-1 text-left text-text">{renderInline(header)}</th>}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={block.rows}>
                {(row) => (
                  <tr>
                    <For each={row}>{(cell) => <td class="border-b border-border/60 px-2 py-1 align-top">{renderInline(cell)}</td>}</For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      )
    default:
      return <p>{renderInline(block.text)}</p>
  }
}

export default function BibleModal() {
  const [isOpen, setIsOpen] = createSignal(false)

  const [content] = createResource(isOpen, async (open) => {
    if (!open) return ''
    const res = await fetch(`${window.location.origin}/api/bible`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { content?: string }
    return body.content ?? ''
  })

  return (
    <>
      <button
        type="button"
        class="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-accent hover:text-text"
        onClick={() => setIsOpen(true)}
      >
        <span aria-hidden="true">📖</span> <span class="hidden sm:inline">AgentZ Bible</span>
      </button>

      <Show when={isOpen()}>
        <div
          class="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            data-testid="bible-modal"
            class="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div class="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 class="text-sm font-semibold uppercase tracking-wide text-text-muted">AgentZ Studio SDK Bible</h2>
              <button type="button" class="text-text-muted hover:text-text" onClick={() => setIsOpen(false)}>
                ✕
              </button>
            </div>
            <div class="overflow-y-auto px-5 py-4 text-left text-sm leading-relaxed text-text-muted">
              <Show when={!content.loading} fallback={<p>Loading…</p>}>
                <Show when={!content.error} fallback={<p class="text-red-400">Failed to load the Bible.</p>}>
                  <div class="space-y-3">
                    <For each={parseMarkdown(content() ?? '')}>{(block) => <BibleBlock block={block} />}</For>
                  </div>
                </Show>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}
