/**
 * Pass A: a reactive read-only mirror of terminalCommands.ts's active AI PO
 * interview. The interview's actual state (poInterview.ts's `PoInterviewState`)
 * is a plain mutable object owned by terminalCommands.ts — never a Solid
 * store itself, since poInterview.ts mutates it directly in place. This
 * module exists so other components (Terminal.tsx's "Build" CTA,
 * ArtifactsPanel.tsx's Discovery Transcript view) can reactively observe its
 * shape without terminalCommands.ts handing out a live mutable reference
 * that bypasses Solid's reactivity — every mutation is republished here as a
 * fresh shallow snapshot instead.
 */
import { createStore } from 'solid-js/store'
import type { PoInterviewState } from './poInterview.ts'

const [state, setState] = createStore<{ interview: PoInterviewState | null }>({ interview: null })

export const interviewState = state

/** Called by terminalCommands.ts after every interview start/turn/cancel. */
export function publishInterviewSnapshot(interview: PoInterviewState | null): void {
  setState(
    'interview',
    interview
      ? {
          ...interview,
          transcript: [...interview.transcript],
          catalog: interview.catalog ? interview.catalog.map((item) => ({ ...item })) : null,
        }
      : null,
  )
}
