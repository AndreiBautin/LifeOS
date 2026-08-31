import type { DailyRun, DailyRunStore } from '@/application/use-cases/daily/once-a-day'
import { logger } from '@/shared/logging/logger'

/**
 * The day something last ran, and what it found.
 *
 * **Device-local and never synced**, the same call the upgrade budget
 * and the program position make. A marker that travelled would have the
 * phone skip its morning read because the laptop did one an hour ago,
 * leaving the phone with nothing to show and no way to say why — and the
 * *result* is a cache of a public feed, so syncing it would be paying
 * for bytes anybody can fetch.
 *
 * **One day's worth, replaced each morning.** It is not an archive: a
 * store that appended would grow without bound holding headlines nobody
 * will read again, which is the "mirror of a feed" this app declined to
 * keep before there was anything to do with one.
 */
export function createDailyRunStore<T>(
  key: string,
  storage: Storage = localStorage,
): DailyRunStore<T> {
  return {
    get(): DailyRun<T> | undefined {
      try {
        const raw = storage.getItem(key)
        if (raw === null) return undefined

        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null) return undefined

        const bag = parsed as { on?: unknown; result?: unknown }

        /*
         * A day key and nothing else. Anything of another shape reads as
         * absent rather than being compared against today, or a
         * hand-edited value could pin the work off forever.
         */
        if (typeof bag.on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(bag.on)) return undefined

        return bag.result === undefined ? { on: bag.on } : { on: bag.on, result: bag.result as T }
      } catch {
        return undefined
      }
    },

    save(run: DailyRun<T>) {
      try {
        storage.setItem(key, JSON.stringify(run))
      } catch (error: unknown) {
        /*
         * Reported rather than swallowed, because this one has a
         * plausible cause: a digest of thirty stories is the largest
         * thing this app puts in localStorage, and a full quota here
         * means the day is never marked and the sources are read on
         * every open. That is the failure worth knowing about.
         */
        logger.warn('daily-run.save-failed', { key, message: String(error) })
      }
    },
  }
}
