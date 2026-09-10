import { Show, createSignal } from 'solid-js'
import { triggerStackrynFileUpload } from '../lib/stackrynIngestClient.ts'
import { setStackrynLoading, setStackrynResult } from '../lib/stackrynDashboardStore.ts'

const ACCEPTED_EXTENSIONS = ['.pdf', '.csv', '.txt', '.json']

function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * UOW-4.0: lets a Product Owner drag/drop (or browse to) a custom discovery
 * artifact straight into the Modernization Cockpit, alongside the canned
 * Preset Cookbook bundle — POSTs multipart/form-data to the same
 * /api/stackryn/ingest route the presets use (see stackrynIngestClient.ts),
 * so uploads share the exact governance/audit/broadcast pipeline.
 */
export default function FileUploadZone() {
  const [isDragging, setIsDragging] = createSignal(false)
  const [uploading, setUploading] = createSignal(false)
  const [status, setStatus] = createSignal<string | null>(null)
  let inputRef: HTMLInputElement | undefined

  async function ingestFile(file: File) {
    if (!hasAcceptedExtension(file.name)) {
      setStatus(`✗ Unsupported file type: ${file.name} (expected .pdf, .csv, .txt, or .json)`)
      return
    }
    setUploading(true)
    setStackrynLoading(`upload:${file.name}`)
    setStatus(`Ingesting ${file.name}…`)
    try {
      const response = await triggerStackrynFileUpload(file)
      setStackrynResult(response)
      const { result } = response
      setStatus(
        result.policyStatus === 'allowed'
          ? `✓ ${file.name}: ${result.metrics?.fitScorePercentage ?? '—'}% fit — see the Modernization Cockpit panel`
          : `✗ ${file.name}: ${result.reason ?? result.policyStatus}`,
      )
    } catch (err) {
      setStackrynLoading(null)
      setStatus(`✗ ${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`)
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer?.files?.[0]
    if (file) void ingestFile(file)
  }

  function handleFileInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement
    const file = target.files?.[0]
    if (file) void ingestFile(file)
    target.value = ''
  }

  return (
    <div
      data-testid="stackryn-file-upload-zone"
      classList={{
        'rounded-md border border-dashed px-3 py-3 text-center text-xs transition-colors': true,
        'border-accent bg-accent/10 text-accent': isDragging(),
        'border-border text-text-muted hover:border-accent/60': !isDragging(),
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept={ACCEPTED_EXTENSIONS.join(',')} class="hidden" onChange={handleFileInput} />
      <Show
        when={!uploading()}
        fallback={<p>Ingesting…</p>}
      >
        <p>
          Drop a discovery artifact here, or{' '}
          <button type="button" class="text-accent underline" onClick={() => inputRef?.click()}>
            browse
          </button>
        </p>
      </Show>
      <p class="mt-1 text-[10px] text-text-muted/70">.pdf · .csv · .txt · .json</p>
      <Show when={status()}>
        <p class="mt-1 text-[11px]" data-testid="stackryn-file-upload-status">
          {status()}
        </p>
      </Show>
    </div>
  )
}
