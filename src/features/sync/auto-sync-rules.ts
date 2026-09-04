/**
 * When an unattended exchange may run, and what counts as a reason to.
 *
 * Pure, and split out of `AutoSync` for one reason: both rules below are
 * things that go wrong **silently**. A guard that fails open syncs during
 * a session, and a trigger that fails open syncs forever — neither
 * throws, neither logs, and both look exactly like working sync from the
 * outside. A component cannot be tested for either without a browser.
 */

/** The mutation key an exchange carries, so it can be told from a write. */
export const SYNC_MUTATION_KEY = ['sync', 'exchange'] as const

export interface ExchangeConditions {
  /** A Firebase project is configured and somebody is signed in. */
  readonly wired: boolean
  /** A workout is open, or the answer is not known yet. */
  readonly sessionOpen: boolean
  /** An exchange is already running. */
  readonly syncing: boolean
  /** The browser believes it has a network. */
  readonly online: boolean
}

/**
 * Whether an automatic exchange may run right now.
 *
 * **The session guard is the one that matters**, and it is why this
 * feature is allowed to exist at all. `useSync` made sync a button
 * deliberately — _"a sync that runs on a timer is a sync that runs while
 * a set is being logged"_ — and that objection is answered rather than
 * overruled: with a session open, nothing here fires. The button is
 * still there for anybody who wants one anyway.
 *
 * Not knowing whether a session is open counts as open. The query
 * resolves a tick after mount, and guessing "no" for that tick is
 * guessing wrong in the only direction that costs anything.
 */
export function mayExchange(conditions: ExchangeConditions): boolean {
  const { wired, sessionOpen, syncing, online } = conditions

  return wired && !sessionOpen && !syncing && online
}

/**
 * Whether a settled mutation is a local change worth pushing.
 *
 * **An exchange is itself a mutation**, so a debounce that fires on any
 * success schedules the next sync from the last one's completion — every
 * few seconds, for as long as the app is open, burning Firestore reads
 * and looking indistinguishable from sync working properly. This is the
 * whole reason the exchange carries a mutation key.
 *
 * A failed or pending write is not a change: pushing on `pending` sends
 * state that does not exist yet, and pushing on `error` sends nothing at
 * all.
 */
export function isLocalChange(
  status: string | undefined,
  mutationKey: readonly unknown[] | undefined,
): boolean {
  if (status !== 'success') return false
  if (mutationKey?.[0] === SYNC_MUTATION_KEY[0]) return false

  return true
}
