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
    onRegisteredSW(url) {
      logger.debug('sw.registered', { url })
    },
    onRegisterError(error) {
      logger.error('sw.register-failed', error)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="border-accent-500/40 bg-ink-900 fixed inset-x-3 top-3 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-xl border p-3 shadow-lg"
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
