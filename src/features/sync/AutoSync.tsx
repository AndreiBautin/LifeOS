import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useServices } from '@/app/context'
import { useActiveWorkout } from '@/features/train/hooks'

import { isLocalChange, mayExchange } from './auto-sync-rules'
import { resolveSyncTarget, useAccount, useSyncConfig, useSyncNow } from './useSync'

/**
 * How long the app waits after a local change before pushing it.
 *
 * Long enough that a burst — ticking six habits, logging three sets —
 * is one exchange rather than six, and short enough that walking to the
 * other device finds the change already there.
 */
export const PUSH_DEBOUNCE_MS = 4000

/**
 * The fallback tick, for when the live listener is not there.
 *
 * **It stopped being the mechanism when the beacon arrived** and became
 * the safety net: a target that cannot watch, a listener dropped on a
 * flaky network, a build with no Firebase project. Five minutes rather
 * than ninety seconds because the listener now covers being live, and a
 * poll that exists only to catch what the listener missed should be
 * cheap.
 *
 * **Only while visible**, which is what keeps it from being a background
 * poller: a phone in a pocket costs nothing.
 */
export const PULL_INTERVAL_MS = 300_000

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
 * **It listens for *when*, and still exchanges for *what*.** One
 * Firestore listener, on a single beacon document the pushing device
 * stamps, says "somebody else wrote". Everything after that is the
 * exchange this app already had — tested, and the only thing that knows
 * how tombstones, the grow-only fog and the day-unioned records merge.
 * A listener per collection would be twenty-one subscriptions and a
 * second merge path for no gain.
 *
 * Four triggers, each answering a different question:
 *
 * - **The beacon** is "the other device just wrote", and it is what
 *   makes this live: a habit ticked on the phone lands on the desktop in
 *   about a second. Attaching the listener also delivers the current
 *   beacon, so a device coming back catches up without waiting.
 * - **Becoming visible** is "I have just walked up to this device", and
 *   it covers the case where the listener was never attached because the
 *   app was closed.
 * - **A local change** schedules a push, debounced, so what you just did
 *   is on its way before you get up.
 * - **An interval while visible** is the fallback for a target that
 *   cannot watch or a listener that dropped.
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
  const services = useServices()

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

  /* --- the other device wrote ---------------------------------------- */
  useEffect(() => {
    if (!wired) return undefined

    let stop: (() => void) | undefined
    /*
     * An object rather than a `let`, because the flag is set from the
     * cleanup after this closure was written: control-flow analysis
     * still has it as `false` here and the lint rule calls the check
     * dead. A property is not narrowed that way, which is the honest
     * shape anyway — this is state shared between the effect and its
     * cleanup, not a local.
     */
    const live = { current: true }

    void (async () => {
      const target = await resolveSyncTarget(services.syncTarget, account)
      if (!live.current) return

      /*
       * A target that cannot watch is not an error — the null target has
       * nobody to hear from. The interval below is the fallback, and it
       * is what every caller had before this existed.
       */
      stop = target.watch?.(() => {
        run.current()
      })
    })()

    return () => {
      live.current = false
      stop?.()
    }
  }, [wired, account, services.syncTarget])

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
