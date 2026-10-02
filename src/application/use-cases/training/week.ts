import type { ExerciseId } from '@/domain/ids/ids'
import { loggedVolume, totalWorkingSets } from '@/domain/logging/workout-log'
import type { Clock, ExerciseRepository, WorkoutRepository } from '@/domain/repositories/ports'
import { mondayOf, shiftDay, toDayKey } from '@/domain/time/day'
import { sumVolume, type VolumeMap } from '@/domain/volume/accounting'

/**
 * The training week so far, and how many weeks in a row have had any.
 *
 * **A calendar week, Monday to Sunday, not the last seven days.** The
 * weekly targets describe one pass through the routine, which starts on a
 * Monday; a rolling window compares a Thursday-to-Wednesday slice against
 * a Monday-to-Saturday plan and is never quite either. It used to be
 * rolling, read off `Date.now()` in a component — the defect the clock
 * port exists to prevent.
 *
 * Finished sessions only, the rule the training grid follows: an
 * abandoned session's sets are real, but a week "with three sessions" in
 * which one was walked away from has not had three.
 */
export interface WeekSummary {
  /** The Monday this week began on, as a day key. */
  readonly monday: string
  readonly sessions: number
  readonly sets: number
  /** Accessory sets per muscle, the same accounting the plan is built on. */
  readonly volume: VolumeMap
  /**
   * Consecutive weeks with at least one finished session, counting this
   * one only once it has a session — a Monday morning does not break a
   * run that the week has not had a chance to continue yet.
   */
  readonly streakWeeks: number
  /**
   * Titles of the sessions finished this week, so the Program page can
   * tick a day off. By title rather than by the weekday it was done on:
   * Monday's session started early on a Friday ticks Monday, which is
   * the day it was, not the day the calendar happened to say.
   */
  readonly doneTitles: readonly string[]
}

export interface WeekDeps {
  readonly workouts: WorkoutRepository
  readonly exercises: ExerciseRepository
  readonly clock: Clock
}

/** Re-exported where the week was first computed; the rule lives in `domain/time/day`. */
export { mondayOf }

export async function weekSummary(deps: WeekDeps): Promise<WeekSummary> {
  const today = toDayKey(deps.clock.now())
  const monday = mondayOf(today)

  const [logs, library] = await Promise.all([deps.workouts.recent(500), deps.exercises.all()])
  const finished = logs.filter((log) => log.status === 'completed' && log.date <= today)
  const thisWeek = finished.filter((log) => log.date >= monday)

  const lookup = (id: ExerciseId) => library.find((exercise) => exercise.id === id)

  const trainedWeeks = new Set(finished.map((log) => mondayOf(log.date)))
  let cursor = trainedWeeks.has(monday) ? monday : shiftDay(monday, -7)
  let streakWeeks = 0
  while (trainedWeeks.has(cursor)) {
    streakWeeks += 1
    cursor = shiftDay(cursor, -7)
  }

  return {
    monday,
    sessions: thisWeek.length,
    sets: thisWeek.reduce((total, log) => total + totalWorkingSets(log), 0),
    volume: sumVolume(thisWeek.map((log) => loggedVolume(log, lookup))),
    streakWeeks,
    doneTitles: [...new Set(thisWeek.map((log) => log.title))],
  }
}
