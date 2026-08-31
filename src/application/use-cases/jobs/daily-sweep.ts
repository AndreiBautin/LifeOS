import { canSweep, type JobSearch } from '@/domain/jobs/search'

import { onceADay, type DailyOutcome, type DailyRunStore } from '../daily/once-a-day'
import { sweepBoards, type LeadDeps, type LeadSweep } from './leads'

/**
 * Reading the boards once a day, on the first open of that day.
 *
 * **The gate is `once-a-day.ts` now, and is shared with the news
 * digest.** It was written here first, with a marker and no store — so
 * the second open of a day answered "already swept" carrying nothing,
 * and the card that had shown thirty leads at eight in the morning
 * rendered blank at noon, with the day marked so it could not run again.
 * A morning's work disappearing with no way to get it back is worse than
 * not having run it. The result is remembered now; see that module for
 * why the day is marked *before* the work, which is the subtle half.
 *
 * **This is not a scheduled job and must not be described as one.** The
 * app has no server and iOS gives a home-screen web app no background
 * fetch, so nothing runs while the app is closed — the same ceiling that
 * stops a daily from ringing. What is available is a sweep that happens
 * when you next open the app, which on something opened every morning is
 * most of the way to the same thing.
 */

export interface DailySweepDeps extends LeadDeps {
  readonly sweepStore: DailyRunStore<LeadSweep>
}

export function sweepIfDue(
  search: JobSearch,
  deps: DailySweepDeps,
): Promise<DailyOutcome<LeadSweep>> {
  return onceADay(canSweep(search), { store: deps.sweepStore, clock: deps.clock }, () =>
    sweepBoards(search.sources, search.profile, search.minimumScore, deps),
  )
}
