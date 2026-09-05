import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import { useServices } from '@/app/context'
import { synchronise, type SyncReport } from '@/application/use-cases/sync/synchronise'
import {
  readFirebaseConfig,
  type FirebaseConfig,
  type FirebaseConfigState,
} from '@/config/firebase'
import { STORAGE_KEYS } from '@/config/storage-keys'
import type { SyncTarget } from '@/domain/repositories/ports'
import { logger } from '@/shared/logging/logger'

import { SYNC_MUTATION_KEY } from './auto-sync-rules'

/**
 * Sync, from the screen's point of view.
 *
 * Everything here is optional in the strongest sense: with no Firebase
 * project configured, nothing in this file constructs a client, opens a
 * connection, or changes what the app does. That is the property worth
 * protecting — the app was useful with no network at all, and adding
 * sync must not quietly make a network the price of using it.
 *
 * Which is also why every reference to the Firebase SDK below is a
 * dynamic `import()`. Bundled statically it lands in the entry chunk and
 * doubles the download for every visit, including the overwhelming
 * majority that never sign in. Split, it is fetched the first time
 * someone actually presses something — and never at all on a build with
 * no project configured.
 */

const config: FirebaseConfigState = readFirebaseConfig()

export function useSyncConfig(): FirebaseConfigState {
  return config
}

/** Narrowed once, so the call sites below do not each re-check. */
function configuredOrThrow(): FirebaseConfig {
  if (config.kind !== 'configured') throw new Error('Sync is not configured on this build.')
  return config.config
}

async function firebase() {
  return import('@/infrastructure/sync/firebase-app')
}

/**
 * The target this device should talk to, or the one that does nothing.
 *
 * **Exported because the watcher needs the same instance the button
 * pushes to.** A second copy of this would be a second answer to "which
 * Firestore am I talking to", and a live listener attached to a
 * different target waits for a beacon nobody writes.
 *
 * With no project or nobody signed in it returns the null target, which
 * accepts everything and returns nothing — so the exchange still runs,
 * still reports, and changes nothing.
 */
export async function resolveSyncTarget(
  nullTarget: SyncTarget,
  account: Account | undefined,
): Promise<SyncTarget> {
  if (config.kind !== 'configured' || account === undefined) return nullTarget

  const [{ firebaseClient, deviceId }, { createFirestoreSyncTarget }] = await Promise.all([
    firebase(),
    import('@/infrastructure/sync/firestore-target'),
  ])

  return createFirestoreSyncTarget({
    db: firebaseClient(configuredOrThrow()).db,
    uid: account.uid,
    clientId: deviceId(localStorage, STORAGE_KEYS.deviceId, () => crypto.randomUUID()),
  })
}

export interface Account {
  readonly uid: string
  readonly email?: string
  readonly displayName?: string
}

/**
 * The signed-in account, or nothing.
 *
 * Subscribed rather than read once: a token can expire and a session can
 * be ended from another tab, and a screen still offering "Sync now"
 * against a dead session is worse than one that says you are signed out.
 */
export function useAccount(): { account: Account | undefined; ready: boolean } {
  const [account, setAccount] = useState<Account | undefined>(undefined)
  const [ready, setReady] = useState(config.kind !== 'configured')

  useEffect(() => {
    if (config.kind !== 'configured') return

    let unsubscribe: (() => void) | undefined

    /*
     * An abort signal rather than a boolean, because the SDK import may
     * still be in flight when this unmounts and a listener must not be
     * attached to a dead component. A plain `let cancelled` reads more
     * simply and does not survive the type checker: it cannot see the
     * mutation happen inside the cleanup closure, narrows the flag to
     * `false`, and reports the guard as dead code.
     */
    const mounted = new AbortController()

    // Read through a call, not a property. Checked directly, the type
    // checker narrows `aborted` to false at the first guard and reports
    // every later one as dead code — which is exactly backwards, since
    // the point is that it can change while an await is in flight.
    const gone = () => mounted.signal.aborted

    void (async () => {
      const { firebaseClient, watchAccount, completeRedirectSignIn } = await firebase()
      if (gone()) return

      const { auth } = firebaseClient(configuredOrThrow())

      /*
       * Collected before the listener is attached.
       *
       * A sign-in that fell back to a redirect finishes on the way back
       * into the app, and the result is only available on that one
       * navigation. Not asking for it means the round trip completes,
       * the credential is discarded, and the screen shows a Sign in
       * button to someone who has just signed in.
       */
      await completeRedirectSignIn(auth)
      if (gone()) return

      unsubscribe = watchAccount(auth, (next) => {
        setAccount(next)
        setReady(true)
      })
    })()

    return () => {
      mounted.abort()
      unsubscribe?.()
    }
  }, [])

  return { account, ready }
}

export function useSignIn() {
  return useMutation({
    mutationFn: async () => {
      const { firebaseClient, signIn } = await firebase()
      return signIn(firebaseClient(configuredOrThrow()).auth)
    },
    onSuccess: () => {
      logger.info('sync.signed-in', {})
    },
  })
}

export function useSignOut() {
  return useMutation({
    mutationFn: async () => {
      const { firebaseClient, signOutOf } = await firebase()
      await signOutOf(firebaseClient(configuredOrThrow()).auth)
    },
    onSuccess: () => {
      logger.info('sync.signed-out', {})
    },
  })
}

/** When this device last completed an exchange. */
export function useSyncState() {
  const services = useServices()

  return useQuery({
    queryKey: ['sync', 'state'],
    queryFn: () => services.syncState.get().then((state) => state ?? null),
  })
}

/**
 * One exchange, on demand.
 *
 * Deliberately a button rather than a background loop. A sync that runs
 * on a timer is a sync that runs while a set is being logged, and the one
 * thing this app must never do is surprise someone mid-session. Pressing
 * it is also how a lifter learns what it does, which matters for a
 * feature whose failure mode is silent.
 */
export function useSyncNow(account: Account | undefined) {
  const services = useServices()
  const client = useQueryClient()

  const resolveTarget = useCallback(
    async (): Promise<SyncTarget> => resolveSyncTarget(services.syncTarget, account),
    [account, services.syncTarget],
  )

  return useMutation<SyncReport>({
    /*
     * Keyed so `AutoSync` can tell an exchange apart from a local write.
     * Its debounce fires on any settled mutation, and an exchange is one
     * — so without a key the sync's own success schedules the next sync,
     * four seconds later, forever.
     */
    mutationKey: SYNC_MUTATION_KEY,
    mutationFn: async () => synchronise(await resolveTarget(), services),
    onSuccess: (report) => {
      logger.info('sync.completed', {
        pushed: report.pushed,
        received: report.received,
        rejected: report.rejected,
      })

      // Everything the exchange could have touched.
      void client.invalidateQueries({ queryKey: ['workouts'] })
      void client.invalidateQueries({ queryKey: ['exercises'] })
      void client.invalidateQueries({ queryKey: ['sync'] })
    },
    onError: (error: unknown) => {
      logger.error('sync.failed', { message: error instanceof Error ? error.message : 'unknown' })
    },
  })
}
