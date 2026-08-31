import { RefreshCw } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

import { Button } from '@/components/shared/primitives'
import { logger } from '@/shared/logging/logger'

/**
 * A new version, offered rather than applied.
 *
 * The service worker is registered with `registerType: 'prompt'` on
 * purpose. Swapping the app out from under someone who is three sets into
 * a session — which `autoUpdate` would do — risks losing the set they are
 * mid-way through typing. The banner waits.
 *
 * **But a waiting worker is not applied by closing the app and opening it
 * again, and that is the trap this had.** A new version installs and then
 * *waits*, and only `skipWaiting` promotes it — so a banner missed once,
 * or dismissed with "Later", left the old shell serving forever. Every
 * restart re-showed the banner and changed nothing, which is exactly what
 * "I closed it and reloaded and it is still the old one" looks like from
 * the outside. Two reports of a stale install came through before the
 * mechanism was suspected rather than the deploy.
 *
 * So a worker that was **already waiting when the page registered** is
 * applied at once. It arrived in an earlier session, which means the
 * reason for prompting does not apply: nothing is three sets into
 * anything a quarter of a second after launch. Updates that arrive
 * *during* a session still ask, which is the case the prompt was for.
 *
 * IndexedDB is untouched by an update either way; only the precached
 * shell is versioned, so reloading never costs data.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(url, registration) {
      logger.debug('sw.registered', { url })

      if (registration?.waiting != null) {
        /*
         * Waiting *before* this registration, so it was installed in an
         * earlier run of the app. Apply it now rather than asking: the
         * question "may I swap the app out" answers itself at launch.
         */
        logger.info('sw.applying-waiting-update', {})

        /*
         * The worker is asked directly rather than through
         * `updateServiceWorker`, which is returned by the very call this
         * callback is an argument to — reaching it needs a ref written
         * during render, which React forbids. This is what that function
         * does anyway: promote the waiting worker, then reload once it
         * takes control.
         */
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            window.location.reload()
          },
          { once: true },
        )
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        return
      }

      /*
       * Ask again whenever the app comes back to the front.
       *
       * `registerType: 'prompt'` decides what happens *once a new version
       * is found*; it does nothing about finding one. The browser checks
       * on a full page load, and an installed PWA on a phone is rarely
       * loaded again — it is resumed from the background for weeks. So a
       * shipped change could sit undelivered indefinitely with no banner
       * and nothing wrong, which is exactly what kept happening.
       *
       * Resuming is the right moment because it is free: the check is a
       * conditional request for one small file, and it happens when the
       * user has just returned rather than while they are mid-set.
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

  if (!needRefresh) return null

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
          void updateServiceWorker(true)
        }}
      >
        Reload
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setNeedRefresh(false)
        }}
      >
        Later
      </Button>
    </div>
  )
}
