import { collection, onSnapshot } from 'firebase/firestore'

import { requireAccount } from './account-holder'
import type { FirestoreCollectionDeps } from './collection'

/**
 * Every collection a screen reads, so a change on one device shows up on
 * the other without anybody reloading.
 *
 * **One listener each rather than one shared beacon.** The beacon that
 * used to exist was telling the app *when to run an exchange*; there is
 * no exchange now, so what a listener is for is knowing which data went
 * stale. Firestore bills the documents that actually changed rather than
 * the subscription, so for one person's records this costs about a read
 * per edit — and a single beacon would mean every write stamping it,
 * which is coupling bought for nothing.
 */
export const LIVE_COLLECTIONS = [
  'exercises',
  'workouts',
  'checkIns',
  'items',
  'projects',
  'upgrades',
  'metrics',
  'reviews',
  'places',
  'trips',
  'vices',
  'finance',
  'rooms',
  'attempts',
  'challenges',
  'campaigns',
  'resume',
] as const

/**
 * Watches them all, and calls back when one changes elsewhere.
 *
 * **A local write is skipped**, which is what stops a loop: saving a
 * record raises a snapshot on this device too, and treating that as news
 * would invalidate the query that just wrote it, refetch, and do it
 * again. `hasPendingWrites` is Firestore's own word for "this change is
 * mine and the server has not confirmed it yet"; `fromCache` covers the
 * first snapshot each listener delivers from its own cache, which is the
 * state the screen already has.
 *
 * Returns one function that detaches all of them. Attaching is cheap and
 * detaching matters: a listener left running after sign-out goes on
 * reading an account that is no longer yours.
 */
/**
 * What a listener needs, which is less than a repository does.
 *
 * Deliberately not `FirestoreCollectionDeps`: watching never deletes, so
 * asking for a tombstone sink here would make a caller supply one to
 * satisfy a type rather than because anything uses it — and a dependency
 * nothing reads is the first thing to be wired wrongly.
 */
export type WatchDeps = Pick<FirestoreCollectionDeps, 'firestore' | 'account'>

export function watchRecords(deps: WatchDeps, onChanged: (name: string) => void): () => void {
  const uid = requireAccount(deps.account)

  const stops = LIVE_COLLECTIONS.map((name) =>
    onSnapshot(
      collection(deps.firestore, 'users', uid, name),
      { includeMetadataChanges: false },
      (snapshot) => {
        if (snapshot.metadata.hasPendingWrites) return
        if (snapshot.metadata.fromCache) return

        onChanged(name)
      },
    ),
  )

  return () => {
    for (const stop of stops) stop()
  }
}
