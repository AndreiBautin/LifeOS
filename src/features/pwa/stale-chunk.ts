import { logger } from '@/shared/logging/logger'

/**
 * Reload when a lazily-loaded chunk has gone missing under us.
 *
 * `registerType: 'autoUpdate'` promotes the new worker the moment it
 * installs, and also hands it the page that is open — which is still
 * running the *old* bundle. From then until the next reload, any dynamic
 * import that page makes asks for a filename by hash: the map adapter,
 * the Firebase SDK. The new precache does not hold those, and a deploy
 * replaces the whole directory, so the server does not either. The import
 * rejects and the route dies behind an error boundary.
 *
 * The window is short — the update banner is asking for the reload that
 * closes it — but "short" is not a guarantee, and "Later" makes it the
 * rest of the session. Vite raises `vite:preloadError` for exactly this
 * case, so the honest handling is to take it as what it almost always is:
 * this page is out of date and the version on disk is not.
 */
export function watchForStaleChunks(): void {
  window.addEventListener('vite:preloadError', () => {
    /*
     * **Never reload twice.** If this page load was itself a reload, the
     * bundle being run is already the one the worker is serving, so a
     * chunk still missing is a real failure — offline, or a build that
     * genuinely lacks the file — and reloading again would spin forever
     * on a screen with nothing on it.
     *
     * The navigation type answers that without storing anything, which
     * is the point: a flag written to survive a reload is persistence,
     * and persistence in this app lives behind a repository port. There
     * is nothing here worth a port.
     *
     * The cost is one edge: reload by hand, then hit a stale chunk, and
     * this logs instead of reloading. That is the right way round — a
     * reload that just happened is evidence the reload is not the fix.
     */
    if (wasReloaded()) {
      logger.error('chunk.stale-after-reload', {})
      return
    }

    logger.info('chunk.stale-reloading', {})
    window.location.reload()
  })
}

function wasReloaded(): boolean {
  const [entry] = performance.getEntriesByType('navigation')

  return entry instanceof PerformanceNavigationTiming && entry.type === 'reload'
}
