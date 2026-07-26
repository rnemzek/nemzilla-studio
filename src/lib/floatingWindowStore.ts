import { createStore } from 'solid-js/store'

export interface FloatWindowState {
  floating: boolean
  x: number
  y: number
  w: number
  zoom: number
  minimized: boolean
  maximized: boolean
  z: number
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5

let zCounter = 50
let cascadeCount = 0

const [windows, setWindows] = createStore<Record<string, FloatWindowState>>({})

function ensure(id: string, defaultWidth: number) {
  if (windows[id]) return
  const offset = (cascadeCount++ % 6) * 28
  setWindows(id, {
    floating: false,
    x: 96 + offset,
    y: 88 + offset,
    w: defaultWidth,
    zoom: 1,
    minimized: false,
    maximized: false,
    z: zCounter,
  })
}

/** Registers `id` if unseen and returns its live state; safe to call on every render. */
export function windowState(id: string, defaultWidth = 420): FloatWindowState {
  ensure(id, defaultWidth)
  return windows[id]!
}

export function isFloating(id: string): boolean {
  return windows[id]?.floating ?? false
}

export function bringToFront(id: string) {
  zCounter += 1
  setWindows(id, 'z', zCounter)
}

export function openFloat(id: string, defaultWidth = 420) {
  ensure(id, defaultWidth)
  setWindows(id, 'floating', true)
  bringToFront(id)
}

export function closeFloat(id: string) {
  if (!windows[id]) return
  setWindows(id, { floating: false, minimized: false, maximized: false })
}

export function setPosition(id: string, x: number, y: number) {
  if (!windows[id]) return
  setWindows(id, { x, y })
}

export function setZoom(id: string, zoom: number) {
  if (!windows[id]) return
  setWindows(id, 'zoom', Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)))
}

export function nudgeZoom(id: string, delta: number) {
  const win = windows[id]
  if (!win) return
  setZoom(id, win.zoom + delta)
}

export function toggleMinimize(id: string) {
  setWindows(id, 'minimized', (v) => !v)
}

export function toggleMaximize(id: string) {
  setWindows(id, 'maximized', (v) => !v)
}
