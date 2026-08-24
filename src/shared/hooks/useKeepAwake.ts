import { useEffect } from 'react'

import { logger } from '@/shared/logging/logger'

/**
 * Holds a screen wake lock while a session is open.
 *
 * A phone that sleeps between sets means unlocking it with chalky hands
 * before every entry, which is the fastest way to stop logging a workout
 * halfway through. The lock is released the moment the session closes and
 * re-acquired when the tab becomes visible again, since the browser drops
 * it on hide.
 *
 * Best-effort throughout: Safari on iOS gained support only recently and
 * some browsers refuse it outright. A refusal is logged and ignored — it
 * is a comfort, not a requirement.
 */
export function useKeepAwake(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    if (!('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | undefined
    let cancelled = false

    const acquire = async (): Promise<void> => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          await lock.release()
          return
        }
        sentinel = lock
      } catch (error) {
        logger.debug('wakelock.denied', { reason: error instanceof Error ? error.name : 'unknown' })
      }
    }

    const onVisible = (): void => {
      if (!document.hidden && sentinel === undefined) void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {
        // Releasing a lock the browser already reclaimed is not a failure.
      })
    }
  }, [enabled])
}
