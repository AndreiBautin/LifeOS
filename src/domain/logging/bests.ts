import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import { estimateOneRepMax, type E1rmFormula } from '@/domain/strength/one-rep-max'

import type { WorkoutLog } from './workout-log'

/**
 * Each exercise's best, all time: the heaviest bar it has carried (most
 * reps breaking a tie) and the best reliable estimated max, with the day
 * and the session each came from.
 *
 * **Finished and abandoned sessions both count** — a set done is a set
 * done, and walking away from the rest of a session does not unlift it.
 * Warm-ups do not. The estimate only reads sets within the formula's
 * reliable range, so a set of twenty does not out-rank a heavy triple.
 */
export interface BestSet {
  readonly load: number
  readonly reps: number
  readonly date: string
  readonly workoutId: WorkoutId
}

export interface ExerciseBests {
  readonly exerciseId: ExerciseId
  readonly heaviest: BestSet
  readonly estimate?: BestSet & { readonly value: number }
  /** How many sessions have trained it. */
  readonly sessions: number
}

export function bestsByExercise(
  logs: readonly WorkoutLog[],
  formula: E1rmFormula = 'epley',
): readonly ExerciseBests[] {
  const found = new Map<
    ExerciseId,
    {
      heaviest: BestSet
      estimate?: BestSet & { value: number }
      sessions: Set<WorkoutId>
    }
  >()

  for (const log of logs) {
    if (log.status === 'in-progress') continue
    for (const entry of log.entries) {
      for (const set of entry.sets) {
        if (set.isWarmup || set.outcome !== 'completed') continue
        const load = set.actualLoad
        const reps = set.actualReps
        if (load === undefined || load <= 0 || reps === undefined || reps <= 0) continue

        const here: BestSet = { load, reps, date: log.date, workoutId: log.id }
        const current = found.get(entry.exerciseId)
        const estimate = estimateOneRepMax(load, reps, formula)
        const candidate = estimate.isReliable ? { ...here, value: estimate.value } : undefined

        if (current === undefined) {
          found.set(entry.exerciseId, {
            heaviest: here,
            ...(candidate === undefined ? {} : { estimate: candidate }),
            sessions: new Set([log.id]),
          })
          continue
        }
        current.sessions.add(log.id)
        if (
          load > current.heaviest.load ||
          (load === current.heaviest.load && reps > current.heaviest.reps)
        ) {
          current.heaviest = here
        }
        if (
          candidate !== undefined &&
          (current.estimate === undefined || candidate.value > current.estimate.value)
        ) {
          current.estimate = candidate
        }
      }
    }
  }

  return [...found.entries()].map(([exerciseId, best]) => ({
    exerciseId,
    heaviest: best.heaviest,
    ...(best.estimate === undefined ? {} : { estimate: best.estimate }),
    sessions: best.sessions.size,
  }))
}
