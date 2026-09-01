import { useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { forgetToday, type DailyRunStore } from '@/application/use-cases/daily/once-a-day'
import type { AppServices } from '@/app/di'

/**
 * Running a once-a-day job again, after one that failed.
 *
 * **The control `once-a-day.ts` said was there and was not.** Its own
 * doc comment reads: *"The failure is surfaced as `failed-earlier` with
 * a manual control beside it, which makes the retry a decision rather
 * than a storm."* There was no such control anywhere —`forgetToday` was
 * written, exported and **called by nothing**, which is the eighth time
 * this project has recorded that shape.
 *
 * What it cost is worth stating, because it is the report this fixes:
 * both morning jobs run on the first open of the day, and a PWA's first
 * open is a resume from the background — which is exactly the moment a
 * phone is most likely to have no usable connection. One failed resume
 * pinned *"Hacker News could not be read"* and *"DEV could not be read"*
 * to the screen until midnight, with the digest itself proving both
 * endpoints answer a browser fine.
 *
 * **A total failure is remembered as a success, which is the subtler
 * half.** `readDigest` catches per-source and returns the failures as
 * *data*, so the gate stores a perfectly good result that happens to be
 * two error lines — `remembered`, not `failed-earlier`, for the rest of
 * the day. Neither path could be retried, and the two arrive at the same
 * dead card by different routes.
 *
 * Forgetting the day and invalidating the query is the whole of it: the
 * next read re-runs the work, because the gate is idempotent within a
 * day and this is what makes the day no longer count.
 */
export function useRetryToday<T>(
  store: (services: AppServices) => DailyRunStore<T>,
  key: readonly unknown[],
): () => void {
  const services = useServices()
  const client = useQueryClient()

  return () => {
    forgetToday(store(services))
    void client.invalidateQueries({ queryKey: key })
  }
}
