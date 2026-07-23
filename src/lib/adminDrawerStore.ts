import { createSignal } from 'solid-js'

/**
 * Pass C Task 3: open/close state for the Admin Usage & Session Drawer.
 * Deliberately not linked from any visible nav — reachable only by typing
 * `admin`/`sessions` in the CLI (terminalCommands.ts) or the Ctrl+Alt+A
 * shortcut (AdminDrawer.tsx), matching the ask's "hidden shortcut/toggle"
 * framing. A plain module-level signal, same pattern as sessionRoleStore.ts.
 */
const [isOpen, setIsOpen] = createSignal(false)

export { isOpen as adminDrawerOpen }

export function openAdminDrawer(): void {
  setIsOpen(true)
}

export function closeAdminDrawer(): void {
  setIsOpen(false)
}

export function toggleAdminDrawer(): void {
  setIsOpen((current) => !current)
}
