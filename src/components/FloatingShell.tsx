import { Show, createSignal, type JSX } from 'solid-js'
import {
  windowState,
  isFloating,
  bringToFront,
  closeFloat,
  setPosition,
  setZoom,
  nudgeZoom,
  toggleMinimize,
  toggleMaximize,
} from '../lib/floatingWindowStore.ts'

interface FloatingShellProps {
  id: string
  title: string
  defaultWidth?: number
  children: JSX.Element
}

function touchDist(touches: TouchList): number {
  const dx = touches[0]!.clientX - touches[1]!.clientX
  const dy = touches[0]!.clientY - touches[1]!.clientY
  return Math.hypot(dx, dy)
}

const SNAP_BACK_DURATION_MS = 220

/**
 * Wraps a Studio panel so it can pop out of the Command Center grid into a
 * draggable, pinch-zoomable "glass" window (Portal-free: the panel's own DOM
 * subtree never remounts, it's just re-positioned with `fixed` + a
 * transform, so live state like the App Preview iframe or an open SSE
 * connection survives detach/re-dock).
 *
 * The docked trigger button that calls `openFloat(id)` lives inside each
 * panel itself, next to its PanelHelpButton — this shell only reacts to
 * store state and owns the floating chrome (drag header, zoom/minimize/
 * maximize, snap-back, pinch/double-tap gestures).
 */
export default function FloatingShell(props: FloatingShellProps) {
  const win = () => windowState(props.id, props.defaultWidth ?? 420)

  let pinchStartDist = 0
  let pinchStartZoom = 1
  let lastTapAt = 0
  let floatingRef: HTMLDivElement | undefined
  let placeholderRef: HTMLDivElement | undefined
  const [snapping, setSnapping] = createSignal(false)

  /**
   * Animates the floating window shrinking back into the dashed docked
   * placeholder before actually flipping the store back to docked, instead
   * of an instant cut. Reads the placeholder's *live* bounding rect rather
   * than a cached "default docked anchor" — the placeholder already sits in
   * the exact grid slot the panel returns to, and re-measuring it live
   * keeps the animation correct across window resizes/scroll without a
   * separate cache-invalidation path.
   */
  function handleSnapBack() {
    if (snapping()) return
    const floatEl = floatingRef
    const target = placeholderRef
    if (!floatEl || !target || win().maximized) {
      closeFloat(props.id)
      return
    }
    const targetRect = target.getBoundingClientRect()
    setSnapping(true)
    floatEl.style.transition = `top ${SNAP_BACK_DURATION_MS}ms ease-in, left ${SNAP_BACK_DURATION_MS}ms ease-in, transform ${SNAP_BACK_DURATION_MS}ms ease-in, opacity ${SNAP_BACK_DURATION_MS}ms ease-in`
    requestAnimationFrame(() => {
      floatEl.style.top = `${targetRect.top}px`
      floatEl.style.left = `${targetRect.left}px`
      floatEl.style.width = `${targetRect.width}px`
      floatEl.style.transform = 'scale(0.85)'
      floatEl.style.opacity = '0'
    })
    setTimeout(() => {
      floatEl.style.transition = ''
      setSnapping(false)
      closeFloat(props.id)
    }, SNAP_BACK_DURATION_MS)
  }

  function handleDragStart(event: PointerEvent) {
    if (win().maximized) return
    // The zoom/minimize/maximize/snap-back buttons live inside this same
    // draggable header, and pointerdown bubbles from them up to here — an
    // unconditional setPointerCapture() below would capture the pointer to
    // the header on every button press too, which silently swallows the
    // button's own click (the browser routes the follow-up click to
    // whichever element holds capture, not the button that was actually
    // pressed). Bail out before capturing when the press started on a
    // button so those clicks reach their own handlers normally.
    if ((event.target as HTMLElement).closest('button')) return
    bringToFront(props.id)
    const header = event.currentTarget as HTMLElement
    header.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const originX = win().x
    const originY = win().y

    function onMove(ev: PointerEvent) {
      const nextX = Math.min(Math.max(originX + (ev.clientX - startX), -320), window.innerWidth - 80)
      const nextY = Math.min(Math.max(originY + (ev.clientY - startY), 0), window.innerHeight - 40)
      setPosition(props.id, nextX, nextY)
    }
    function onUp() {
      header.removeEventListener('pointermove', onMove)
      header.removeEventListener('pointerup', onUp)
      header.removeEventListener('pointercancel', onUp)
    }
    header.addEventListener('pointermove', onMove)
    header.addEventListener('pointerup', onUp)
    header.addEventListener('pointercancel', onUp)
  }

  function handleTouchStart(event: TouchEvent) {
    if (!isFloating(props.id)) return
    if (event.touches.length === 2) {
      pinchStartDist = touchDist(event.touches)
      pinchStartZoom = win().zoom
    } else if (event.touches.length === 1) {
      const now = Date.now()
      if (now - lastTapAt < 350) {
        toggleMaximize(props.id)
        lastTapAt = 0
      } else {
        lastTapAt = now
      }
    }
  }

  function handleTouchMove(event: TouchEvent) {
    if (event.touches.length === 2 && pinchStartDist > 0) {
      event.preventDefault()
      setZoom(props.id, pinchStartZoom * (touchDist(event.touches) / pinchStartDist))
    }
  }

  function handleTouchEnd(event: TouchEvent) {
    if (event.touches.length < 2) pinchStartDist = 0
  }

  return (
    <div class="relative">
      <Show when={isFloating(props.id)}>
        <div
          ref={placeholderRef}
          class="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-accent/40 bg-surface/40 text-center text-xs text-text-muted"
        >
          <div>
            <p class="mb-1">
              ↗ <span class="font-medium text-text">{props.title}</span> is floating
            </p>
            <button
              type="button"
              class="rounded border border-accent/40 px-2 py-0.5 text-accent transition-colors hover:bg-accent/10"
              onClick={handleSnapBack}
            >
              ⤓ Snap Back to Command Center
            </button>
          </div>
        </div>
      </Show>

      <div
        ref={floatingRef}
        classList={{
          // True glassmorphism: a semi-transparent dark layer + backdrop
          // blur/saturate so the Command Center behind the panel stays
          // subtly visible, a soft white edge highlight (how light actually
          // catches a glass pane's border, not a solid color), and a
          // two-part shadow — a dark elevation shadow for physical lift plus
          // the existing accent-purple glow so it stays on-brand.
          'fixed rounded-2xl border border-white/10 bg-surface/75 backdrop-blur-md backdrop-saturate-[1.8] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.55),0_0_48px_-10px_var(--color-accent-glow)] touch-none':
            isFloating(props.id),
          'inset-4': isFloating(props.id) && win().maximized,
          'z-50': isFloating(props.id),
        }}
        style={
          isFloating(props.id) && !win().maximized
            ? { top: `${win().y}px`, left: `${win().x}px`, width: `${win().w}px`, 'max-height': '82vh', transform: `scale(${win().zoom})`, 'transform-origin': 'top left' }
            : undefined
        }
        onPointerDown={() => isFloating(props.id) && bringToFront(props.id)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Show when={isFloating(props.id)}>
          <div
            class="flex cursor-grab touch-none items-center justify-between gap-2 rounded-t-2xl border-b border-white/10 bg-surface-raised/70 px-3 py-1.5 text-[11px] font-medium text-text backdrop-blur-sm active:cursor-grabbing"
            onPointerDown={handleDragStart}
          >
            <span class="truncate">↗ {props.title}</span>
            <div class="flex shrink-0 items-center gap-1 text-text-muted">
              <button type="button" title="Zoom out" class="rounded px-1 hover:bg-surface hover:text-text" onClick={() => nudgeZoom(props.id, -0.1)}>
                −
              </button>
              <span class="w-9 text-center font-mono">{Math.round(win().zoom * 100)}%</span>
              <button type="button" title="Zoom in" class="rounded px-1 hover:bg-surface hover:text-text" onClick={() => nudgeZoom(props.id, 0.1)}>
                +
              </button>
              <button
                type="button"
                title={win().minimized ? 'Restore' : 'Minimize'}
                class="rounded px-1 hover:bg-surface hover:text-text"
                onClick={() => toggleMinimize(props.id)}
              >
                {win().minimized ? '▢' : '—'}
              </button>
              <button
                type="button"
                title={win().maximized ? 'Restore' : 'Maximize'}
                class="rounded px-1 hover:bg-surface hover:text-text"
                onClick={() => toggleMaximize(props.id)}
              >
                {win().maximized ? '❐' : '□'}
              </button>
              <button
                type="button"
                title="Snap Back to Command Center"
                class="whitespace-nowrap rounded border border-accent/40 px-1.5 py-0.5 text-accent hover:bg-accent/10"
                onClick={handleSnapBack}
              >
                ⤓ Snap Back
              </button>
            </div>
          </div>
        </Show>
        <div classList={{ hidden: isFloating(props.id) && win().minimized, 'overflow-auto': isFloating(props.id) }}>
          {props.children}
        </div>
      </div>
    </div>
  )
}
