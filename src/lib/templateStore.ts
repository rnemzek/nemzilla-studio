import { createSignal } from 'solid-js'
import { TEMPLATE_REGISTRY, DEFAULT_TEMPLATE_ID, getTemplate, type DomainTemplate } from '../config/templateRegistry.ts'

/**
 * Pass E: the active domain template — a plain module-level signal, same
 * pattern as adminDrawerStore.ts/sessionRoleStore.ts. Not persisted to
 * localStorage: this is a per-session "which swarm am I looking at" mode,
 * not a durable identity (contrast with visitorStore.ts's persona/visitorId).
 */
const [activeTemplateId, setActiveTemplateIdSignal] = createSignal<string>(DEFAULT_TEMPLATE_ID)

/**
 * UAT fix: distinguishes "the default template nobody's touched yet" from
 * "the visitor explicitly ran /template" — poInterview.ts only sends the
 * active template's systemPromptOverlay to the AI PO when this is true.
 * Without it, every interview silently got the 'order-entry' overlay's
 * "keep the discovery centered on a vendor/company name..." instruction by
 * default, even for a visitor who never touched /template and just typed
 * "let's make a to-do list" — hijacking the AI PO's own natural-language
 * domain judgment with an overlay nobody asked for. The Swarm Canvas idle
 * preview / App Preview domain badge still default to 'order-entry' for
 * *display* purposes; only the AI PO's conversation is gated on this.
 */
const [templateExplicitlySet, setTemplateExplicitlySetSignal] = createSignal(false)

export { activeTemplateId, templateExplicitlySet }

export function getActiveTemplate(): DomainTemplate {
  return getTemplate(activeTemplateId()) ?? TEMPLATE_REGISTRY[0]!
}

/** Returns the matched template on success, or null if `id` isn't in the registry (caller prints the error). */
export function setActiveTemplate(id: string): DomainTemplate | null {
  const template = getTemplate(id)
  if (!template) return null
  setActiveTemplateIdSignal(id)
  setTemplateExplicitlySetSignal(true)
  return template
}

export { TEMPLATE_REGISTRY }
export type { DomainTemplate }
