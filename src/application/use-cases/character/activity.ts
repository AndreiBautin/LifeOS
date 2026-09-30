import { ALL_ACTS } from '@/domain/game/registry'
import { xpFrom } from '@/domain/game/xp'
import { localDayOf, parseDay, shiftDay, toDayKey } from '@/domain/time/day'

import { countActs, loadActRecords, type SheetDeps } from './sheet'

/**
 * XP earned on each day of the last few months, for the activity grid.
 *
 * **A re-presentation of the same tally, never a count of its own.** Each
 * day is `countActs` over the records the character sheet already reads,
 * narrowed to that one day, and priced by the same `xpFrom` — so the
 * grid's cells sum to the XP those weeks earned and cannot disagree with
 * the level above them. A heatmap that counted "records touched" instead
 * would be a fourth currency with a calendar on it.
 */
export interface ActivityDay {
  readonly day: string
  readonly xp: number
  /** Past today, so the grid can draw the rest of this week as empty slots. */
  readonly future: boolean
}

export interface Activity {
  /** Monday-first weeks, oldest first; each is seven days. */
  readonly weeks: readonly (readonly ActivityDay[])[]
  readonly activeDays: number
  readonly totalXp: number
  /** Consecutive days with XP, ending today or yesterday. */
  readonly streak: number
}

export async function activityFor(deps: SheetDeps, weekCount = 18): Promise<Activity> {
  const today = toDayKey(deps.clock.now())
  // Monday of this week: getDay() is Sunday-first, so Sunday is six back.
  const weekday = parseDay(today).getUTCDay()
  const monday = shiftDay(today, -((weekday + 6) % 7))
  const start = shiftDay(monday, -7 * (weekCount - 1))

  const records = await loadActRecords(deps)

  const weeks = Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, offset): ActivityDay => {
      const day = shiftDay(start, week * 7 + offset)
      const future = day > today
      const xp = future
        ? 0
        : xpFrom(
            countActs(records, (stamp) => localDayOf(stamp) === day),
            ALL_ACTS,
          )
      return { day, xp, future }
    }),
  )

  const past = weeks.flat().filter((one) => !one.future)
  const activeDays = past.filter((one) => one.xp > 0).length
  const totalXp = past.reduce((sum, one) => sum + one.xp, 0)

  // Today with nothing yet does not break the run — the day is not over.
  let streak = 0
  for (let index = past.length - 1; index >= 0; index -= 1) {
    const one = past[index]
    if (one === undefined) break
    if (one.xp > 0) streak += 1
    else if (one.day !== today) break
  }

  return { weeks, activeDays, totalXp, streak }
}
