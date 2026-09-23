/**
 * Whether the desktop sidebar is collapsed to icons only.
 *
 * Device-local and never synced, the same call the upgrade budget and
 * the program position make: this is a fact about a monitor's width
 * multiplied against however wide the person wants the rail on it, not
 * a fact about the account, and travelling would have a phone override
 * a preference set for a desk.
 */
export function readSidebarCollapsed(key: string, storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(key) === 'true'
  } catch {
    return false
  }
}

export function saveSidebarCollapsed(
  key: string,
  collapsed: boolean,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(key, collapsed ? 'true' : 'false')
  } catch {
    /*
     * A UI preference failing to persist is not worth surfacing — the
     * toggle still works for the rest of the session, it just forgets
     * on reload. Nothing downstream depends on this succeeding.
     */
  }
}
