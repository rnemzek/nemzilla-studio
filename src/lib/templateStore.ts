import { createSignal } from 'solid-js'
import { TEMPLATE_REGISTRY, DEFAULT_TEMPLATE_ID, getTemplate, type DomainTemplate } from '../config/templateRegistry.ts'

/**
 * Pass E: the active domain template — a plain module-level signal, same
 * pattern as adminDrawerStore.ts/sessionRoleStore.ts. Not persisted to
 * localStorage: this is a per-session "which swarm am I looking at" mode,
 * not a durable identity (contrast with visitorStore.ts's persona/visitorId).
 */
const [activeTemplateId, setActiveTemplateIdSignal] = createSignal<string>(DEFAULT_TEMPLATE_ID)

export { activeTemplateId }

export function getActiveTemplate(): DomainTemplate {
  return getTemplate(activeTemplateId()) ?? TEMPLATE_REGISTRY[0]!
}

/** Returns the matched template on success, or null if `id` isn't in the registry (caller prints the error). */
export function setActiveTemplate(id: string): DomainTemplate | null {
  const template = getTemplate(id)
  if (!template) return null
  setActiveTemplateIdSignal(id)
  return template
}

export { TEMPLATE_REGISTRY }
export type { DomainTemplate }
