import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { GitHubSyncError } from '@/infrastructure/sync/github-file'
import { syncWithGitHub } from '@/infrastructure/sync/github-sync'
import { logger } from '@/shared/logging/logger'

import { syncStore } from './sync-store'

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev'

/**
 * How close together two automatic rounds may run.
 *
 * Asked for as syncing "whenever you switch pages", which on a quick tour
 * of the app is a round every second — each a request to GitHub, and a
 * commit whenever something changed. Fifteen seconds keeps the feel of
 * syncing on every move while bounding the traffic. A round asked for by
 * hand, or by connecting, skips it.
 */
const THROTTLE_MS = 15_000

/**
 * Runs sync rounds: on launch, on every change of page, and whenever the
 * app comes back to the foreground.
 *
 * **One round at a time.** A request that arrives mid-round is remembered
 * and run once the round finishes, rather than started beside it — two
 * rounds in parallel would read the same file and race each other's
 * writes, which the retry would survive but nothing would be gained by.
 *
 * Mounted once, in the shell. Silent when no repository is connected.
 */
export function useGitHubSync(): void {
  const services = useServices()
  const { settings } = useSettings()
  const client = useQueryClient()
  const { pathname } = useLocation()

  const latestSettings = useRef(settings)
  useEffect(() => {
    latestSettings.current = settings
  }, [settings])

  const state = useRef({ running: false, again: false, lastRun: 0 })

  /*
   * The round is defined inside the effect that registers it, rather than
   * as a memoised callback: it calls itself to run a queued request, and a
   * self-referencing `useCallback` is something the compiler cannot keep.
   */
  useEffect(() => {
    const run = async (force: boolean): Promise<void> => {
      const config = syncStore.get().config
      if (config === undefined) return

      const now = services.clock.now().getTime()
      if (!force && now - state.current.lastRun < THROTTLE_MS) return
      if (state.current.running) {
        state.current.again = true
        return
      }

      state.current.running = true
      state.current.lastRun = now
      syncStore.phase('syncing')

      try {
        const result = await syncWithGitHub(config, services, {
          settings: latestSettings.current,
          appVersion: APP_VERSION,
          now: services.clock.now(),
        })
        syncStore.synced(services.clock.now().toISOString())
        logger.info('sync.round', {
          pulled: result.pulled,
          purged: result.purged,
          uploaded: result.uploaded,
        })
        // Only when something arrived: refetching every screen after a
        // round that changed nothing would be a flicker for no reason.
        if (result.pulled + result.purged > 0) void client.invalidateQueries()
      } catch (error) {
        const reason = error instanceof GitHubSyncError ? error.reason : 'unexpected'
        syncStore.phase(
          'error',
          error instanceof GitHubSyncError ? error.message : 'Sync failed unexpectedly.',
        )
        logger.warn('sync.failed', { reason })
      } finally {
        state.current.running = false
        if (state.current.again) {
          state.current.again = false
          void run(true)
        }
      }
    }

    syncStore.onRequest((force) => {
      void run(force)
    })
    return () => {
      syncStore.onRequest(undefined)
    }
  }, [services, client])

  // Launch, and every change of page.
  useEffect(() => {
    syncStore.request(false)
  }, [pathname])

  // Coming back to the app — the moment the other device's changes matter.
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') syncStore.request(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
