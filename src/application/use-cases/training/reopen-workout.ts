import type { WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { remainingSets } from '@/domain/logging/workout-log'
import type { WorkoutRepository } from '@/domain/repositories/ports'

/**
 * Picking a session back up after finishing it by mistake.
 *
 * The third thing that can go wrong at the end of a session, and the one
 * the app had no verb for. {@link finishWorkout} handles *"I am done"*,
 * {@link abandonWorkout} handles *"I stopped"*, and
 * {@link deleteWorkout} handles *"this never happened"*. None of them
 * covers *"it is not over yet"* — a session finished on a mis-tap with
 * sets still to do, where the work already logged is real and the record
 * should survive.
 *
 * Delete is the wrong tool for it, and was the only one available: it
 * erases the sets that were genuinely performed to undo the one tap that
 * was not.
 *
 * **It moves nothing in the program.** It used to restore a stored cursor
 * to the reopened session's day, because finishing had advanced past it.
 * The calendar decides the day now and finishing advances nothing, so
 * reopening is only what it says: the record goes back to running.
 */

export interface ReopenWorkoutDeps {
  readonly workouts: WorkoutRepository
}

export type ReopenWorkoutResult =
  | { readonly kind: 'reopened'; readonly workout: WorkoutLog }
  /** No workout with that id. */
  | { readonly kind: 'missing' }
  /** Nothing left to do — reopening it would be an edit, not a resumption. */
  | { readonly kind: 'nothing-left' }
  /** Another session is already open; two at once is not a state. */
  | { readonly kind: 'session-open' }
  /** A later session has been filed, so the queue has moved on. */
  | { readonly kind: 'not-the-latest' }

export async function reopenWorkout(
  workoutId: WorkoutId,
  deps: ReopenWorkoutDeps,
): Promise<ReopenWorkoutResult> {
  const workout = await deps.workouts.byId(workoutId)
  if (workout === undefined) return { kind: 'missing' }

  /*
   * Only a session with work left. Reopening a genuinely complete one is
   * an edit of history wearing a resumption's clothes, and it has no
   * coherent meaning: there is nothing to return to the Train screen for.
   * Editing a logged set is a different feature and should look like one.
   */
  if (remainingSets(workout) === 0) return { kind: 'nothing-left' }

  /*
   * One open session at a time, the same invariant `startWorkout`
   * enforces from the other direction. Two would make "the current
   * session" ambiguous everywhere it is read.
   */
  const open = await deps.workouts.inProgress()
  if (open !== undefined && open.id !== workout.id) return { kind: 'session-open' }

  /*
   * Nothing filed after it.
   *
   * Reopening a session with a later one already in the history would
   * put a running session behind a finished one and file its sets out of
   * order. Refused rather than resolved: the honest recovery there is a
   * session from scratch for the missing sets, which costs a row in the
   * history and loses nothing.
   */
  const [latest] = await deps.workouts.recent(1)
  if (latest !== undefined && latest.id !== workout.id) return { kind: 'not-the-latest' }

  /*
   * `completedAt` goes with the status. Left behind it would be a
   * completion time on a running session — a small lie that outlives the
   * mistake, and exactly the sort of thing a later report reads without
   * questioning.
   */
  const { completedAt: _finished, ...rest } = workout
  const reopened: WorkoutLog = { ...rest, status: 'in-progress' }

  await deps.workouts.save(reopened)

  return { kind: 'reopened', workout: reopened }
}
