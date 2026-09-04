import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useActiveWorkout } from '@/features/train/hooks'

import { isLocalChange, mayExchange } from './auto-sync-rules'
import { useAccount, useSyncConfig, useSyncNow } from './useSync'

/**
 * How long the app waits after a local change before pushing it.
 *
 * Long enough that a burst — ticking six habits, logging three sets —
 * is one exchange rather than six, and short enough that walking to the
 * other device finds the change already there.
 */
export const PUSH_DEBOUNCE_MS = 4000

/**
 * How often a visible app checks for what the other device did.
 *
 * **Only while visible**, which is what keeps this from being a
 * background poller: a phone in a pocket costs nothing, and the desktop
 * left open on another monitor is the case worth paying for.
 */
export const PULL_INTERVAL_MS = 90_000

/**
 * Exchanges without being asked, and this reverses a rule in `useSync`.
 *
 * That rule made sync a button on purpose: _"a sync that runs on a timer
 * is a sync that runs while a set is being logged, and the one thing
 * this app must never do is surprise someone mid-session."_ The
 * objection is real and is **answered rather than overruled** — an open
 * session blocks every trigger here, so the timer cannot fire during the
 * one activity it would interrupt. What is left is the case the button
 * was making somebody do by hand: two devices, the same records, and a
 * manual push standing between them.
 *
 * Asked for as _"synced live both ways instead of relying on a manual
 * push"_, once the app went onto a desktop as well as a phone.
 *
 * **It reuses `synchronise` rather than listening to Firestore.** A live
 * listener per collection would be twenty-four subscriptions and a
 * second merge path, where the exchange this app already has is tested,
 * handles tombstones and the grow-only fog, and carries a cursor. What
 * makes it feel live is *when* it runs, not how it reads.
 *
 * Three triggers, each answering a different question:
 *
 * - **Becoming visible** is "I have just walked up to this device", and
 *   it is the one that matters most — switching from phone to desktop
 *   pulls before the screen has finished painting.
 * - **A local change** schedules a push, debounced, so what you just did
 *   is on the other device before you get there.
 * - **An interval while visible** covers two devices open at once, which
 *   is the only case the first two miss.
 *
 * `online` is deliberately not a trigger of its own: coming back onto a
 * network almost always coincides with the tab becoming visible, and the
 * exchange is a no-op offline anyway.
 *
 * Renders nothing. It is mounted once in `AppShell`, so there is one
 * loop for the app rather than one per screen.
 */
export function AutoSync() {
  const config = useSyncConfig()
  const { account } = useAccount()
  const syncNow = useSyncNow(account)
  const active = useActiveWorkout()
  const client = useQueryClient()

  /*
   * The mutation object is new on every render, so a trigger closing
   * over it would re-subscribe every time. The ref keeps the effects
   * below depending on facts rather than on identities.
   */
  const run = useRef<() => void>(() => undefined)

  const wired = config.kind === 'configured' && account !== undefined
  /*
   * `undefined` is "not loaded yet" and `null` is "nothing open", so a
   * plain falsy check would let the first trigger fire before the answer
   * is known — which is exactly the mid-session case this guards.
   */
  const sessionOpen = active.data !== null

  /*
   * Assigned in an effect rather than during render: a ref written while
   * rendering is torn in a concurrent re-render, and the lint rule says
   * so. It runs after every render, so the closure the triggers call is
   * never more than one commit stale — and every trigger is an event or
   * a timer, both of which fire after the commit.
   */
  useEffect(() => {
    run.current = () => {
      const online = typeof navigator === 'undefined' || navigator.onLine
      if (!mayExchange({ wired, sessionOpen, syncing: syncNow.isPending, online })) return

      syncNow.mutate()
    }
  })

  /* --- becoming visible, and once on mount --------------------------- */
  useEffect(() => {
    if (!wired) return undefined

    const onVisible = () => {
      if (document.visibilityState === 'visible') run.current()
    }

    onVisible()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [wired])

  /* --- a local change, debounced ------------------------------------- */
  useEffect(() => {
    if (!wired) return undefined

    let timer: ReturnType<typeof setTimeout> | undefined

    const unsubscribe = client.getMutationCache().subscribe((event) => {
      if (!isLocalChange(event.mutation?.state.status, event.mutation?.options.mutationKey)) return

      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        run.current()
      }, PUSH_DEBOUNCE_MS)
    })

    return () => {
      if (timer !== undefined) clearTimeout(timer)
      unsubscribe()
    }
  }, [wired, client])

  /* --- the slow tick, only while the app is on screen ---------------- */
  useEffect(() => {
    if (!wired) return undefined

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') run.current()
    }, PULL_INTERVAL_MS)

    return () => {
      clearInterval(timer)
    }
  }, [wired])

  return null
}
