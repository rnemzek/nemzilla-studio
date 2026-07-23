import { createStore } from 'solid-js/store'
import { AGENT_TRACE_ACTIONS, type AuditBlock } from './auditStore.ts'
import type { SavedRun } from './runHistoryStore.ts'

export interface ReplayState {
  run: SavedRun | null
  steps: AuditBlock[]
  stepIndex: number
  playing: boolean
  speed: 1 | 2
}

const [state, setState] = createStore<ReplayState>({
  run: null,
  steps: [],
  stepIndex: -1,
  playing: false,
  speed: 1,
})

/** Reactive — SwarmCanvas.tsx and ArtifactsPanel.tsx both read this same singleton. */
export const replayState = state

let playTimer: ReturnType<typeof setInterval> | null = null

function clearTimer(): void {
  if (playTimer !== null) {
    clearInterval(playTimer)
    playTimer = null
  }
}

/**
 * Pass B: the Replay & Inspection Engine. Filters a saved (or live) run's
 * audit blocks down to `AGENT_TRACE_ACTIONS` — the same set the Agent Trace
 * tab already renders — so "Step X of Y" always lines up with what a user
 * saw there. Entering replay is what SwarmCanvas.tsx watches to pause its
 * live `/api/agent/spectate` connection and switch to rendering
 * `buildReplaySnapshot(steps, stepIndex)` (swarmStore.ts) instead.
 */
export function startReplay(run: SavedRun): void {
  clearTimer()
  const steps = run.auditBlocks.filter((block) => AGENT_TRACE_ACTIONS.has(block.action))
  setState({ run, steps, stepIndex: steps.length > 0 ? 0 : -1, playing: false, speed: 1 })
}

export function stopReplay(): void {
  clearTimer()
  setState({ run: null, steps: [], stepIndex: -1, playing: false, speed: 1 })
}

function seek(index: number): void {
  if (state.steps.length === 0) return
  setState('stepIndex', Math.max(0, Math.min(index, state.steps.length - 1)))
}

export function stepForward(): void {
  if (state.stepIndex >= state.steps.length - 1) {
    setState('playing', false)
    clearTimer()
    return
  }
  seek(state.stepIndex + 1)
}

export function stepBack(): void {
  setState('playing', false)
  clearTimer()
  seek(state.stepIndex - 1)
}

export function seekTo(index: number): void {
  setState('playing', false)
  clearTimer()
  seek(index)
}

function startTimer(): void {
  playTimer = setInterval(stepForward, 1400 / state.speed)
}

export function togglePlay(): void {
  if (state.playing) {
    setState('playing', false)
    clearTimer()
    return
  }
  if (state.stepIndex >= state.steps.length - 1) seek(0)
  setState('playing', true)
  startTimer()
}

export function setSpeed(speed: 1 | 2): void {
  setState('speed', speed)
  if (state.playing) {
    clearTimer()
    startTimer()
  }
}
