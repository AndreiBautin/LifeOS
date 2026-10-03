import { useSyncExternalStore } from 'react'

/** Chromium's install event; not in the DOM typings. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | undefined
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/**
 * Keeps Chromium's install event for later.
 *
 * **It fires once, early, often before any screen has mounted**, so it is
 * caught at startup and held here rather than in a component: a card that
 * listened for itself would miss it on every launch it was not already on
 * screen for. `appinstalled` drops it, so the card leaves the moment the
 * app is installed.
 */
export function watchForInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = undefined
    notify()
  })
}

/** Whether the browser will show its own install dialog on request. */
export function useCanPrompt(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => deferred !== undefined,
  )
}

/** Shows the browser's dialog; true when the person installed. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (event === undefined) return false
  deferred = undefined
  notify()
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}

/** iOS has no install event: Safari's Share sheet is the only way. */
export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export type InstallOffer = 'none' | 'prompt' | 'ios'

/**
 * Whether to offer installing, and how.
 *
 * **Only to somebody who has trained with it**: asking a first-time
 * visitor to install an app they have not used is the banner everybody
 * dismisses unread. Never once installed or dismissed on this device, and
 * never where the browser offers no way — a card whose button does
 * nothing is worse than none.
 */
export function installOffer(state: {
  readonly installed: boolean
  readonly dismissed: boolean
  readonly hasTrained: boolean
  readonly canPrompt: boolean
  readonly ios: boolean
}): InstallOffer {
  if (state.installed || state.dismissed || !state.hasTrained) return 'none'
  if (state.canPrompt) return 'prompt'
  return state.ios ? 'ios' : 'none'
}
