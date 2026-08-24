/**
 * Every storage key the app uses, in one place.
 *
 * A key spelled inline in two components is a key that will eventually be
 * spelled differently in two components. More pressingly, the demo build
 * and the personal build must never share a namespace — a reviewer
 * clicking the deployed link must not be able to see, or overwrite,
 * anything real. Deriving both from one prefix makes that structural
 * rather than a matter of remembering.
 *
 * An ESLint rule forbids touching `localStorage` outside
 * `infrastructure/storage/`, so this is the only route to a key.
 */

const PREFIX = import.meta.env.VITE_DEMO_MODE === 'true' ? 'lift.demo' : 'lift'

export const STORAGE_KEYS = {
  settings: `${PREFIX}.settings`,
  /** Set once the install prompt has been dismissed, so it is not nagged. */
  installPromptDismissed: `${PREFIX}.install-dismissed`,
  /** Set once the storage-durability explanation has been acknowledged. */
  storageNoticeSeen: `${PREFIX}.storage-notice-seen`,
} as const

/** The IndexedDB database name, kept in the same namespace as the keys. */
export const DATABASE_NAME = PREFIX

export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true'
