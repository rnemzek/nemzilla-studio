/**
 * UOW-1.0: normalizes a Stackryn multi-format ingest payload (PDF text
 * extract, CSV, or plain text) into one shape the governance engine can
 * evaluate uniformly, regardless of source format.
 */

export type IngestFormat = 'pdf' | 'csv' | 'txt'

export interface ParsedIngestPayload {
  format: IngestFormat
  filename: string
  recordCount: number
  fields: string[]
  excerpt: string
}

const SUPPORTED_FORMATS: readonly IngestFormat[] = ['pdf', 'csv', 'txt']

export function isSupportedFormat(value: unknown): value is IngestFormat {
  return typeof value === 'string' && (SUPPORTED_FORMATS as readonly string[]).includes(value)
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

/** `format` is caller-declared (from the request body), not sniffed from the filename. */
export function parseIngestPayload(format: IngestFormat, filename: string, payload: string): ParsedIngestPayload {
  if (format === 'csv') {
    const { recordCount, fields, excerpt } = parseCsv(payload)
    return { format, filename, recordCount, fields, excerpt }
  }

  // 'pdf' payloads arrive as already-extracted text (see fixtures/stackryn/*.pdf.txt) —
  // there is no binary PDF parsing step, just the same line-record shape as 'txt'.
  const { recordCount, excerpt } = parseLines(payload)
  return { format, filename, recordCount, fields: [], excerpt }
}
