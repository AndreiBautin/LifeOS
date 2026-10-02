import { totalWorkingSets } from '@/domain/logging/workout-log'
import type { Clock, WorkoutRepository } from '@/domain/repositories/ports'
import { parseDay, shiftDay, toDayKey } from '@/domain/time/day'

/**
 * Working sets on each day of the last few months, for the training grid.
 *
 * **Counted off finished sessions and nothing else.** It used to be the
 * character sheet's XP cut by day; the XP went when the app stopped being
 * a game, and the honest quantity underneath it was always the work. A
 * set count rather than a session count, so a heavy day and a short one
 * do not draw the same.
 */

export interface ActivityDeps {
  readonly workouts: WorkoutRepository
  readonly clock: Clock
}

export interface ActivityDay {
  readonly day: string
  readonly sets: number
  /** Past today, so the grid can draw the rest of this week as empty slots. */
  readonly future: boolean
}

export interface Activity {
  /** Monday-first weeks, oldest first; each is seven days. */
  readonly weeks: readonly (readonly ActivityDay[])[]
  readonly sessions: number
  readonly sets: number
}

export async function activityFor(deps: ActivityDeps, weekCount = 18): Promise<Activity> {
  const today = toDayKey(deps.clock.now())
  // Monday of this week: getDay() is Sunday-first, so Sunday is six back.
  const weekday = parseDay(today).getUTCDay()
  const monday = shiftDay(today, -((weekday + 6) % 7))
  const start = shiftDay(monday, -7 * (weekCount - 1))

  const finished = (await deps.workouts.recent(500)).filter(
    (log) => log.status === 'completed' && log.date >= start && log.date <= today,
  )

  const setsOn = new Map<string, number>()
  for (const log of finished) {
    setsOn.set(log.date, (setsOn.get(log.date) ?? 0) + totalWorkingSets(log))
  }

  const weeks = Array.from({ length: weekCount }, (_, week) =>
    Array.from({ length: 7 }, (_, offset): ActivityDay => {
      const day = shiftDay(start, week * 7 + offset)
      return { day, sets: setsOn.get(day) ?? 0, future: day > today }
    }),
  )

  return {
    weeks,
    sessions: finished.length,
    sets: finished.reduce((total, log) => total + totalWorkingSets(log), 0),
  }
}
