/**
 * UOW-1.0: normalizes a Stackryn multi-format ingest payload (PDF text
 * extract, CSV, or plain text) into one shape the governance engine can
 * evaluate uniformly, regardless of source format.
 */

export type IngestFormat = 'pdf' | 'csv' | 'txt' | 'json'

export interface ParsedIngestPayload {
  format: IngestFormat
  filename: string
  recordCount: number
  fields: string[]
  excerpt: string
}

const SUPPORTED_FORMATS: readonly IngestFormat[] = ['pdf', 'csv', 'txt', 'json']

const EXTENSION_FORMATS: Record<string, IngestFormat> = { pdf: 'pdf', csv: 'csv', txt: 'txt', json: 'json' }

export function isSupportedFormat(value: unknown): value is IngestFormat {
  return typeof value === 'string' && (SUPPORTED_FORMATS as readonly string[]).includes(value)
}

/** UOW-4.0: maps a client-uploaded file's extension to an ingest format (drag-and-drop has no caller-declared `format` field, unlike the JSON preset path). */
export function inferFormatFromFilename(filename: string): IngestFormat | null {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  return EXTENSION_FORMATS[ext] ?? null
}

function parseCsv(payload: string): { recordCount: number; fields: string[]; excerpt: string } {
  const lines = payload.trim().split(/\r?\n/).filter((line) => line.length > 0)
  const [headerLine, ...rows] = lines
  const fields = headerLine ? headerLine.split(',').map((field) => field.trim()) : []
  return { recordCount: rows.length, fields, excerpt: rows[0] ?? '' }
}

function parseLines(payload: string): { recordCount: number; excerpt: string } {
  const lines = payload.trim().split(/\r?\n/).filter((line) => line.length > 0)
  return { recordCount: lines.length, excerpt: lines[0] ?? '' }
}

/** UOW-4.0: client-uploaded `.json` discovery artifacts — an array of records or a single object. */
function parseJson(payload: string): { recordCount: number; fields: string[]; excerpt: string } {
  let data: unknown
  try {
    data = JSON.parse(payload)
  } catch {
    return { recordCount: 0, fields: [], excerpt: payload.slice(0, 200) }
  }
  if (Array.isArray(data)) {
    const first = data[0]
    const fields = first && typeof first === 'object' ? Object.keys(first as Record<string, unknown>) : []
    return { recordCount: data.length, fields, excerpt: JSON.stringify(first ?? {}).slice(0, 500) }
  }
  if (data && typeof data === 'object') {
    return { recordCount: 1, fields: Object.keys(data as Record<string, unknown>), excerpt: JSON.stringify(data).slice(0, 500) }
  }
  return { recordCount: 1, fields: [], excerpt: String(data).slice(0, 200) }
}

/** `format` is caller-declared (from the request body) or inferred from the upload filename, not sniffed from content. */
export function parseIngestPayload(format: IngestFormat, filename: string, payload: string): ParsedIngestPayload {
  if (format === 'csv') {
    const { recordCount, fields, excerpt } = parseCsv(payload)
    return { format, filename, recordCount, fields, excerpt }
  }
  if (format === 'json') {
    const { recordCount, fields, excerpt } = parseJson(payload)
    return { format, filename, recordCount, fields, excerpt }
  }

  // 'pdf' payloads arrive as already-extracted text (see fixtures/stackryn/*.pdf.txt) —
  // there is no binary PDF parsing step, just the same line-record shape as 'txt'.
  const { recordCount, excerpt } = parseLines(payload)
  return { format, filename, recordCount, fields: [], excerpt }
}
