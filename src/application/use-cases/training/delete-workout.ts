import type { WorkoutId } from '@/domain/ids/ids'
import { totalWorkingSets } from '@/domain/logging/workout-log'
import type { WorkoutRepository } from '@/domain/repositories/ports'

/**
 * Erasing a session that should never have been filed.
 *
 * Distinct from abandoning, and deliberately so — the two answer
 * different questions. {@link abandonWorkout} handles *"I stopped
 * training"*: the session is real, the work in it counts, and the record
 * is kept unless it is empty. This handles *"this session did not
 * happen"*, which is a claim about the record rather than about the
 * training, and the only honest response to it is removal.
 *
 * It exists because finishing is a single tap on the largest control on
 * the Train screen and there was no way back from it. A mis-tap filed a
 * completed workout with every set still pending, which is not a
 * catastrophe for volume — pending sets are counted by nobody — but does
 * put a session in the history and on the session count that the lifter
 * knows they never trained. History that a lifter has to mentally
 * discount is worse than history with a gap in it.
 *
 * Deliberately not undoable, and deliberately not paired with anything
 * that moves the program. Deleting a record says the record was wrong; it
 * says nothing about where the lifter is in their block, and quietly
 * rewinding the position from here would make one destructive action into
 * two — the second invisible.
 */

export interface DeleteWorkoutDeps {
  readonly workouts: WorkoutRepository
}

export type DeleteWorkoutResult =
  /** The record was removed. `workingSets` is what went with it. */
  { readonly kind: 'deleted'; readonly workingSets: number } | { readonly kind: 'not-found' }

export async function deleteWorkout(
  workoutId: WorkoutId,
  deps: DeleteWorkoutDeps,
): Promise<DeleteWorkoutResult> {
  const workout = await deps.workouts.byId(workoutId)
  if (workout === undefined) return { kind: 'not-found' }

  const workingSets = totalWorkingSets(workout)
  await deps.workouts.remove(workout.id)

  return { kind: 'deleted', workingSets }
}
