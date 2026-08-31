import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

import { Button } from '@/components/shared/primitives'
import { logger } from '@/shared/logging/logger'

/**
 * A new version, installed quietly and applied when you say so.
 *
 * **The worker and the page answer two different questions, and they used
 * to be answered together.** "Should the new version take over as the
 * worker" and "should this page reload right now" are not the same
 * question, and `registerType: 'prompt'` said no to both: a new version
 * installed and then *waited*, indefinitely, for a client to send it
 * `SKIP_WAITING`.
 *
 * That stranded a real install. A banner missed once — or answered with
 * "Later" — left the old shell serving forever, and closing the app and
 * opening it again never promotes a waiting worker, so every restart
 * re-showed the banner and changed nothing. Worse, the client-side repair
 * for it shipped and could not reach the device that needed it: the fix
 * lived in the bundle the stale worker was refusing to serve. **Only a
 * change to the worker itself reaches a stuck install**, because the
 * browser fetches `sw.js` from the network rather than through the worker
 * it replaces.
 *
 * So the worker is `autoUpdate` and promotes itself, and the *page* keeps
 * the prompt. The reason the prompt existed still holds — nobody's set
 * should vanish mid-session because a deploy landed — but it is no longer
 * the thing standing between a shipped change and the device.
 *
 * IndexedDB is untouched either way; only the precached shell is
 * versioned, so reloading never costs data.
 */
export function UpdatePrompt() {
  /*
   * The banner's own state rather than `needRefresh`, which belongs to
   * the prompt flow. In auto mode the library calls `onNeedReload` — on
   * the worker having *activated* — and `updateServiceWorker` becomes a
   * no-op, so there is nothing for that state to mean here.
   */
  const [ready, setReady] = useState(false)

  useRegisterSW({
    /*
     * Called once the new worker has taken over. Without this the library
     * reloads the page by itself, which is exactly the mid-session swap
     * this component exists to prevent.
     */
    onNeedReload() {
      logger.info('sw.update-ready', {})
      setReady(true)
    },

    onRegisteredSW(url, registration) {
      logger.debug('sw.registered', { url })

      /*
       * Ask again whenever the app comes back to the front.
       *
       * The registration type decides what happens *once a new version is
       * found*; it does nothing about finding one. The browser checks on
       * a full page load, and an installed PWA on a phone is rarely
       * loaded again — it is resumed from the background for weeks. So a
       * shipped change could sit undelivered indefinitely with nothing
       * visibly wrong.
       *
       * Resuming is the right moment because it is free: the check is a
       * conditional request for one small file, and it lands when the
       * user has just returned rather than mid-set.
       */
      if (registration === undefined) return

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        void registration.update().catch((error: unknown) => {
          // Offline is the ordinary case here, not a fault worth a banner.
          logger.debug('sw.update-check-failed', { message: String(error) })
        })
      })
    },

    onRegisterError(error) {
      logger.error('sw.register-failed', error)
    },
  })

  if (!ready) return null

  return (
    <div
      role="status"
      className="border-accent-500/40 bg-ink-900 fixed inset-x-3 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-xl border p-3 shadow-lg"
      // Below the status bar rather than under it — this is the one banner
      // that appears without being asked for, so it must not land on top
      // of the clock.
      style={{ top: 'calc(0.75rem + var(--safe-top))' }}
    >
      <RefreshCw size={18} className="text-accent-400 shrink-0" aria-hidden />
      <p className="text-ink-100 flex-1 text-sm">
        A new version is ready. Your data is unaffected.
      </p>
      <Button
        size="sm"
        variant="primary"
        onClick={() => {
          /*
           * A plain reload, because the worker has already taken over —
           * `updateServiceWorker` only has work to do in prompt mode,
           * where it is what sends `SKIP_WAITING`. Here it returns
           * without doing anything, and calling it would look like the
           * button worked while nothing happened.
           */
          window.location.reload()
        }}
      >
        Reload
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setReady(false)
        }}
      >
        Later
      </Button>
    </div>
  )
}
