import type { ExerciseId } from '@/domain/ids/ids'

import { topSet, versusLast, type Performance, type Versus } from './versus-last'
import { workingSets, type WorkoutLog } from './workout-log'

/**
 * Two sessions side by side, exercise by exercise: each one's working
 * volume (load × reps, summed) and top set, and how this session's top set
 * stands against the other's by the rule every other screen uses
 * (`versusLast`).
 *
 * In this session's order, then anything only the other session had —
 * an exercise dropped is part of the comparison, not a gap in it.
 */
export interface ComparedExercise {
  readonly exerciseId: ExerciseId
  readonly here?: { readonly volume: number; readonly top?: Performance }
  readonly there?: { readonly volume: number; readonly top?: Performance }
  readonly versus?: Versus
}

export function compareSessions(here: WorkoutLog, there: WorkoutLog): readonly ComparedExercise[] {
  const ids = [...new Set([...exercisesIn(here), ...exercisesIn(there)])]
  return ids.map((exerciseId) => {
    const mine = side(here, exerciseId)
    const theirs = side(there, exerciseId)
    const versus =
      mine?.top === undefined || theirs?.top === undefined
        ? undefined
        : versusLast(mine.top, theirs.top)
    return {
      exerciseId,
      ...(mine === undefined ? {} : { here: mine }),
      ...(theirs === undefined ? {} : { there: theirs }),
      ...(versus === undefined ? {} : { versus }),
    }
  })
}

function exercisesIn(log: WorkoutLog): readonly ExerciseId[] {
  return log.entries
    .filter((entry) => workingSets(entry).length > 0)
    .map((entry) => entry.exerciseId)
}

function side(
  log: WorkoutLog,
  exerciseId: ExerciseId,
): { readonly volume: number; readonly top?: Performance } | undefined {
  const sets = log.entries
    .filter((entry) => entry.exerciseId === exerciseId)
    .flatMap((entry) => workingSets(entry))
  if (sets.length === 0) return undefined
  const volume = sets.reduce((sum, set) => sum + (set.actualLoad ?? 0) * (set.actualReps ?? 0), 0)
  // From the sets themselves: `topSetIn` filters by day version, and a
  // Light calf raise read as having no top set at all.
  const top = topSet(sets.map((set) => ({ load: set.actualLoad, reps: set.actualReps })))
  return top === undefined ? { volume } : { volume, top }
}
