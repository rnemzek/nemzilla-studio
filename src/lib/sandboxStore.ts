import { createStore } from 'solid-js/store'
import { SANDBOX_FRAME_PATH, SANDBOX_MESSAGE, buildSandboxDocument } from './sandboxTemplate.ts'

export type PreviewStatus = 'idle' | 'building' | 'ready' | 'error'
export type PreviewTab = 'preview' | 'source'

export interface SandboxState {
  code: string
  status: PreviewStatus
  tab: PreviewTab
  errorMessage: string | null
}

export interface SandboxStore {
  state: SandboxState
  setTab: (tab: PreviewTab) => void
  setCode: (code: string) => void
  /**
   * Wires a mounted `<iframe src="/sandbox-frame">` to the store: sends the
   * current code once the frame signals readiness, reloads + resends on
   * code changes, and listens for runtime errors reported back over
   * postMessage. Returns a cleanup function.
   */
  attachFrame: (frame: HTMLIFrameElement) => () => void
  /**
   * Opens its own `/api/agent/stream?prompt=...` connection and drives the
   * store from `generated_app_payload` events: intermediate chunks
   * (`done: false`) append to `state.code` for a live "typing" effect in the
   * Source Code tab, and the final chunk (`done: true`) calls `setCode` to
   * push the complete app into the preview iframe. Returns a disconnector.
   */
  connectGenerator: (prompt: string) => () => void
}

function parseFrame(chunk: string): { event: string; data: Record<string, unknown> } {
  let event = ''
  const dataLines: string[] = []
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice('event: '.length)
    else if (line.startsWith('data: ')) dataLines.push(line.slice('data: '.length))
  }
  if (!event || dataLines.length === 0) return { event: '', data: {} }
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) as Record<string, unknown> }
  } catch {
    return { event: '', data: {} }
  }
}

/**
 * Owns the sandbox preview's reactive state and the postMessage handshake
 * with the `/sandbox-frame` iframe:
 *
 *   parent sets src -> child loads -> child posts `ready`
 *   -> parent posts `code` (full envelope HTML) -> child document.write()s it
 *   -> child posts `rendered` (success) or `error` (uncaught exception)
 *
 * A code change after the frame already rendered forces a fresh navigation
 * (cache-busted `src`) rather than a second `document.write` on the same
 * document — `document.write` after initial load tears down the previous
 * document's event listeners, so the shim wouldn't be able to hear a second
 * `code` message without first re-registering via a real reload.
 */
export function createSandboxStore(initialCode = ''): SandboxStore {
  const [state, setState] = createStore<SandboxState>({
    code: initialCode,
    status: 'idle',
    tab: 'preview',
    errorMessage: null,
  })

  let frame: HTMLIFrameElement | null = null
  let frameReady = false

  function send() {
    if (!frameReady || !frame?.contentWindow || !state.code) return
    frame.contentWindow.postMessage(
      { type: SANDBOX_MESSAGE.code, html: buildSandboxDocument(state.code) },
      '*',
    )
  }

  function setTab(tab: PreviewTab) {
    setState('tab', tab)
  }

  function setCode(code: string) {
    setState({ code, status: code ? 'building' : 'idle', errorMessage: null })
    if (!frame) return
    frameReady = false
    frame.src = `${SANDBOX_FRAME_PATH}?t=${Date.now()}`
  }

  function appendCodeChunk(chunk: string) {
    setState('code', (prev) => prev + chunk)
    setState('status', 'building')
  }

  function connectGenerator(prompt: string): () => void {
    const controller = new AbortController()
    setState({ code: '', status: 'building', errorMessage: null })

    ;(async () => {
      try {
        const url = `${window.location.origin}/api/agent/stream?prompt=${encodeURIComponent(prompt)}`
        const res = await fetch(url, { signal: controller.signal })
        if (!res.body) throw new Error('agent stream: empty response body')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let boundary = buffer.indexOf('\n\n')
          while (boundary !== -1) {
            const { event, data } = parseFrame(buffer.slice(0, boundary))
            buffer = buffer.slice(boundary + 2)

            if (event === 'generated_app_payload') {
              const code = typeof data.code === 'string' ? data.code : ''
              if (data.done) setCode(code)
              else appendCodeChunk(code)
            }

            boundary = buffer.indexOf('\n\n')
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return
        setState({ status: 'error', errorMessage: err instanceof Error ? err.message : String(err) })
      }
    })()

    return () => controller.abort()
  }

  function onMessage(event: MessageEvent) {
    if (!frame || event.source !== frame.contentWindow) return
    const data = event.data as { type?: string; message?: string } | undefined
    switch (data?.type) {
      case SANDBOX_MESSAGE.ready:
        frameReady = true
        send()
        break
      case SANDBOX_MESSAGE.rendered:
        setState({ status: 'ready', errorMessage: null })
        break
      case SANDBOX_MESSAGE.error:
        setState({ status: 'error', errorMessage: data.message ?? 'Unknown runtime error' })
        break
    }
  }

  function attachFrame(el: HTMLIFrameElement): () => void {
    frame = el
    frameReady = false
    window.addEventListener('message', onMessage)

    return () => {
      window.removeEventListener('message', onMessage)
      if (frame === el) frame = null
    }
  }

  return { state, setTab, setCode, attachFrame, connectGenerator }
}
