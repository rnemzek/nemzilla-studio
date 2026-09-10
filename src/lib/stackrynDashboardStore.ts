/**
 * UOW-3.0: holds the most recent Stackryn ingest result so the trigger
 * buttons (CookbookDropdown.tsx) and the Modernization Cockpit panel
 * (StackrynCockpitPanel.tsx) — siblings in the header/workspace, like
 * sandboxStore's own doc comment describes for AppPreview/CookbookDropdown —
 * share one source of truth instead of each holding independent state.
 */
import { createStore } from 'solid-js/store'
import type { StackrynIngestResponse } from './stackrynIngestClient.ts'

export interface StackrynDashboardState {
  latest: StackrynIngestResponse | null
  loadingPresetId: string | null
}

const [state, setState] = createStore<StackrynDashboardState>({ latest: null, loadingPresetId: null })

export const stackrynDashboardState = state

export function setStackrynLoading(presetId: string | null): void {
  setState('loadingPresetId', presetId)
}

export function setStackrynResult(response: StackrynIngestResponse): void {
  setState({ latest: response, loadingPresetId: null })
}
