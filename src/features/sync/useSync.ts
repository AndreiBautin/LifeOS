import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import {
  readFirebaseConfig,
  type FirebaseConfig,
  type FirebaseConfigState,
} from '@/config/firebase'
import { logger } from '@/shared/logging/logger'

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
