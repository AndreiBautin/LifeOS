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
  /**
   * The backlog's own preferences — default sort, default category.
   *
   * Its own key rather than a field on `settings`, because they are two
   * records about two different things and a single blob would mean a
   * muscle tier and a list's sort order sharing a change stamp.
   */
  backlogSettings: `${PREFIX}.backlog-settings`,
  /** Set once the install prompt has been dismissed, so it is not nagged. */
  installPromptDismissed: `${PREFIX}.install-dismissed`,
  /** Set once the storage-durability explanation has been acknowledged. */
  storageNoticeSeen: `${PREFIX}.storage-notice-seen`,
  /**
   * Ids of built-in programs this install has already been offered, so an
   * update can add new ones without resurrecting deleted ones.
   */
  deliveredBuiltIns: `${PREFIX}.delivered-built-ins`,
  /**
   * Where this device is in its conversation with a sync target.
   *
   * Alongside settings rather than in IndexedDB so that a rebuilt
   * database does not leave a cursor pointing past records the device no
   * longer holds.
   */
  syncState: `${PREFIX}.sync-state`,
  /**
   * A stable id for this device, not this account.
   *
   * Two devices share an account, and the whole point is that each can
   * tell its own writes apart from the other one's. Regenerating it per
   * load would make a device collect back everything it had ever sent.
   */
  deviceId: `${PREFIX}.device-id`,
} as const

/** The IndexedDB database name, kept in the same namespace as the keys. */
export const DATABASE_NAME = PREFIX

export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true'
