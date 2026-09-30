import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import type { ExerciseId } from '@/domain/ids/ids'
import { estimateFromWorkout, type WorkoutLog } from '@/domain/logging/workout-log'

/**
 * Each competition lift's estimated max, session by session.
 *
 * **The same estimate the session report shows**, read back off the logs
 * with `estimateFromWorkout` — so a point on the chart is a number the
 * app already said once, on the day, rather than a second derivation that
 * could disagree with it. Only reliable estimates are plotted: a set of
 * fifteen produces a figure the formula is not fitted for, and a line
 * that jumped every time somebody did a light day would be a chart of the
 * formula's error rather than of the lifter.
 *
 * Completed sessions only. An abandoned one still holds real sets, but
 * the report never read it, and the chart should not know more than the
 * screen that files the session.
 */
export type TrendLift = keyof typeof STRENGTH_LIFT_SLUGS

export interface TrendPoint {
  readonly date: string
  readonly value: number
}

export type StrengthTrend = Readonly<Record<TrendLift, readonly TrendPoint[]>>

export function strengthTrend(logs: readonly WorkoutLog[]): StrengthTrend {
  const done = logs
    .filter((log) => log.status === 'completed')
    .toSorted((a, b) => a.date.localeCompare(b.date))

  const seriesFor = (lift: TrendLift): readonly TrendPoint[] =>
    done.flatMap((log) => {
      const estimate = estimateFromWorkout(log, STRENGTH_LIFT_SLUGS[lift] as ExerciseId)
      return estimate?.isReliable === true
        ? [{ date: log.date, value: Math.round(estimate.value) }]
        : []
    })

  return {
    squat: seriesFor('squat'),
    bench: seriesFor('bench'),
    deadlift: seriesFor('deadlift'),
  }
}
