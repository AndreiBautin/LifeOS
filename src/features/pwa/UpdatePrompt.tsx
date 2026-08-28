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
