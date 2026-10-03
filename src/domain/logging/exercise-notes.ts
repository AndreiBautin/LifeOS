import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'

import type { LoggedSet, WorkoutLog } from './workout-log'

export interface ExerciseNote {
  readonly date: string
  readonly workoutId: WorkoutId
  readonly text: string
  /** The set it was written on; absent for a note on the exercise as a whole. */
  readonly set?: { readonly number: number; readonly load?: number; readonly reps?: number }
}

/**
 * Every note written about one exercise, newest first.
 *
 * A note is written into one set on one day and then shown only beside
 * "Last" the next time — so "left shoulder twinged" from March is gone by
 * April. Gathered here they read as the exercise's own diary. **Set notes
 * and notes on the exercise in a session count; a session's own note does
 * not**, because it is about the day rather than the lift. A set is
 * numbered among the working sets, the way the player numbers it.
 */
export function exerciseNotes(
  logs: readonly WorkoutLog[],
  exerciseId: ExerciseId,
): readonly ExerciseNote[] {
  const notes: ExerciseNote[] = []
  for (const log of logs) {
    if (log.status === 'in-progress') continue
    for (const entry of log.entries) {
      if (entry.exerciseId !== exerciseId) continue
      const text = entry.notes?.trim()
      if (text !== undefined && text !== '') {
        notes.push({ date: log.date, workoutId: log.id, text })
      }
      const working = entry.sets.filter((set) => !set.isWarmup)
      for (const [at, set] of working.entries()) {
        const note = set.notes?.trim()
        if (note === undefined || note === '') continue
        notes.push({ date: log.date, workoutId: log.id, text: note, set: describeSet(set, at) })
      }
    }
  }
  return notes.toSorted((a, b) => b.date.localeCompare(a.date))
}

function describeSet(set: LoggedSet, at: number): NonNullable<ExerciseNote['set']> {
  return {
    number: at + 1,
    ...(set.actualLoad === undefined ? {} : { load: set.actualLoad }),
    ...(set.actualReps === undefined ? {} : { reps: set.actualReps }),
  }
}
