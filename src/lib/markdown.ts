/**
 * A minimal, hand-rolled markdown parser — not a general-purpose CommonMark
 * implementation, just enough to render .codex/AGENTZ-STUDIO-SDK.md cleanly
 * (headings, ASCII-art code fences, bold/inline-code/links, bullet & numbered
 * lists, GFM pipe tables, horizontal rules). Kept dependency-free to match
 * this project's consistent no-new-runtime-deps track record across UOW-06
 * through UOW-09 (e.g. the Source Code tab stayed plain monospace rather
 * than pulling in a syntax highlighter).
 */

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'hr' }
  | { type: 'code'; content: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    if (line.trim() === '') {
      i++
      continue
    }

    if (line.startsWith('```')) {
      const content: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        content.push(lines[i]!)
        i++
      }
      i++ // skip closing fence
      blocks.push({ type: 'code', content: content.join('\n') })
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1]!.length as 1 | 2 | 3, text: headingMatch[2]! })
      i++
      continue
    }

    if (/^-{3,}\s*$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    if (/^\|.*\|\s*$/.test(line.trim()) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1]!.trim())) {
      const headers = splitTableRow(line)
      i += 2 // header row + separator row
      const rows: string[][] = []
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i]!.trim())) {
        rows.push(splitTableRow(lines[i]!))
        i++
      }
      blocks.push({ type: 'table', headers, rows })
      continue
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'list', ordered: false, items })
      continue
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !/^#{1,3}\s/.test(lines[i]!) &&
      !lines[i]!.startsWith('```') &&
      !/^-{3,}\s*$/.test(lines[i]!.trim())
    ) {
      paraLines.push(lines[i]!)
      i++
    }
    blocks.push({ type: 'paragraph', text: paraLines.join(' ') })
  }

  return blocks
}

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; text: string; href: string }

const INLINE_PATTERN = /\*\*(.+?)\*\*|`([^`]+?)`|\[([^\]]+)\]\(([^)]+)\)/g

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let lastIndex = 0
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0
    if (index > lastIndex) nodes.push({ type: 'text', value: text.slice(lastIndex, index) })
    if (match[1] !== undefined) nodes.push({ type: 'bold', value: match[1] })
    else if (match[2] !== undefined) nodes.push({ type: 'code', value: match[2] })
    else if (match[3] !== undefined && match[4] !== undefined) nodes.push({ type: 'link', text: match[3], href: match[4] })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) nodes.push({ type: 'text', value: text.slice(lastIndex) })
  return nodes
}
