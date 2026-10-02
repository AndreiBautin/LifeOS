import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import { topSet, type Performance } from '@/domain/logging/versus-last'
import { workingSets, type WorkoutLog } from '@/domain/logging/workout-log'
import { DAY_VERSIONS } from '@/domain/splits/rp-splits'
import { bestEstimate } from '@/domain/strength/one-rep-max'

/**
 * One exercise across every session that did it, split by version.
 *
 * **Versions are kept apart because they progress apart.** The calf raise
 * runs heavy for 10–20 on one day and light for 20–30 on another; one
 * line through both would zig-zag between two loads and say nothing
 * about either. An exercise with one version has one series, under no
 * name.
 *
 * Finished sessions only, the rule the trend and the week follow, and a
 * session that never reached the exercise contributes nothing — the same
 * "last time is a time it was done" rule that planning reads.
 */
export interface ExerciseSession {
  readonly workoutId: WorkoutId
  readonly date: string
  readonly startedAt: string
  readonly title: string
  readonly top: Performance
  /** Every working set done, in order. */
  readonly sets: readonly Performance[]
  /** Best estimated max the session's sets imply, when the formula is fitted for them. */
  readonly estimate?: number
}

export interface ExerciseSeries {
  /** The version's name — `Heavy`, `Light` — or undefined for the only one. */
  readonly variant: string | undefined
  /** Oldest first, the order a chart draws. */
  readonly sessions: readonly ExerciseSession[]
  /** Heaviest top set, then most reps at it — the `topSet` rule across sessions. */
  readonly best: Performance
}

export function exerciseHistory(
  logs: readonly WorkoutLog[],
  exerciseId: ExerciseId,
): readonly ExerciseSeries[] {
  const byVariant = new Map<string | undefined, ExerciseSession[]>()

  const finished = logs
    .filter((log) => log.status === 'completed')
    .toSorted((a, b) => a.startedAt.localeCompare(b.startedAt))

  for (const log of finished) {
    for (const entry of log.entries.filter((one) => one.exerciseId === exerciseId)) {
      const done = workingSets(entry)
      const sets = done.map((set) => ({ load: set.actualLoad, reps: set.actualReps }))
      const top = topSet(sets)
      if (top === undefined) continue

      const estimate = bestEstimate(
        done.flatMap((set) =>
          set.actualLoad !== undefined && set.actualReps !== undefined && set.actualLoad > 0
            ? [{ load: set.actualLoad, reps: set.actualReps }]
            : [],
        ),
      )
      /*
       * A slot's variant is usually its sub-category — Compound, Working —
       * which says what kind of work a row is, not which version of the
       * exercise it was. Only a named day version splits a series.
       */
      const version =
        entry.variant !== undefined && DAY_VERSIONS.includes(entry.variant)
          ? entry.variant
          : undefined
      const list = byVariant.get(version) ?? []
      list.push({
        workoutId: log.id,
        date: log.date,
        startedAt: log.startedAt,
        title: log.title,
        top,
        sets,
        ...(estimate?.isReliable === true ? { estimate: Math.round(estimate.value) } : {}),
      })
      byVariant.set(version, list)
    }
  }

  return [...byVariant.entries()].flatMap(([variant, sessions]) => {
    const best = topSet(sessions.map((session) => session.top))
    return best === undefined ? [] : [{ variant, sessions, best }]
  })
}
