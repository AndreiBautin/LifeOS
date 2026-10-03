import type { WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { WorkoutRepository } from '@/domain/repositories/ports'

/**
 * A line about the whole session — "slept four hours", "new gym" — kept
 * on the log beside the sets it explains.
 *
 * **Blank clears it** rather than storing an empty string: a note field
 * that held `''` is a state every reader would have to treat as absent.
 * Trimmed, and capped, because it is a line rather than a journal.
 */
export const NOTE_LIMIT = 280

export async function noteWorkout(
  workoutId: WorkoutId,
  notes: string,
  deps: { readonly workouts: WorkoutRepository },
): Promise<WorkoutLog> {
  const workout = await deps.workouts.byId(workoutId)
  if (workout === undefined) throw new Error(`No workout found with id ${workoutId}.`)
  const text = notes.trim().slice(0, NOTE_LIMIT)
  const { notes: _previous, ...rest } = workout
  const updated: WorkoutLog = text === '' ? rest : { ...rest, notes: text }
  await deps.workouts.save(updated)
  return updated
}
