import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useServices } from '@/app/context'

import { useAccount } from './useSync'

/**
 * Keeps an open screen current when the other device writes.
 *
 * Both devices read the same collections, so a reload was always
 * correct — this removes the reload. A habit ticked on the phone lands
 * on the desktop in about a second, with no exchange, no cursor and no
 * button, because there is nothing to reconcile: the listener says which
 * collection changed and the query layer refetches it.
 *
 * **It invalidates rather than writing into the cache.** A snapshot
 * carries documents, and pushing those straight into React Query would
 * be a second path by which data reaches a screen — one that knows
 * nothing about the shaping every use case does on the way out. Marking
 * the queries stale and letting them refetch keeps one road in.
 *
 * Mounted once in `AppShell`. Renders nothing.
 */
export function LiveRecords() {
  const services = useServices()
  const { account } = useAccount()
  const client = useQueryClient()

  const holder = services.account
  const uid = account?.uid

  useEffect(() => {
    /*
     * Nothing to watch on a build with no Firebase project, and nothing
     * to watch before sign-in — `AuthGate` holds every screen back until
     * there is a uid, so this effect simply has no work until then.
     */
    if (holder === undefined || uid === undefined) return undefined

    let stop: (() => void) | undefined
    const live = { current: true }

    void (async () => {
      const [{ watchRecords }, { readFirebaseConfig }, { firebaseClient }] = await Promise.all([
        import('@/infrastructure/firestore/live'),
        import('@/config/firebase'),
        import('@/infrastructure/sync/firebase-app'),
      ])
      if (!live.current) return

      const config = readFirebaseConfig()
      if (config.kind !== 'configured') return

      stop = watchRecords(
        {
          firestore: firebaseClient(config.config).db,
          account: holder,
          clock: services.clock,
        },
        () => {
          /*
           * Everything, rather than a key per collection. The names here
           * are Firestore's and the query keys are the features' — a map
           * between them would be a third list to keep in step, and this
           * app has already paid for two of those. A refetch of what is
           * on screen is cheap; a stale screen is the bug.
           */
          void client.invalidateQueries()
        },
      )
    })()

    return () => {
      live.current = false
      stop?.()
    }
  }, [holder, uid, client, services.clock])

  return null
}
