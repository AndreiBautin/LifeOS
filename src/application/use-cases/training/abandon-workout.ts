import type { WorkoutId } from '@/domain/ids/ids'
import { totalWorkingSets, type WorkoutLog } from '@/domain/logging/workout-log'
import type { Clock, InstanceRepository, WorkoutRepository } from '@/domain/repositories/ports'

/**
 * Walking away from a session that was started and not trained.
 *
 * Without this, a session opened by accident is a dead end: the app shows
 * it on every visit to the Train screen, and the only way out is to
 * finish it — which files a workout with no sets and counts as a training
 * day against every frequency and volume figure.
 *
 * Two outcomes, and the difference is what was actually logged.
 *
 * Nothing logged: the record is **deleted**. It describes an event that
 * did not happen, and keeping a row that says so would put an empty
 * session in the history to be explained forever.
 *
 * Something logged: the record is **kept**, marked `abandoned`, and the
 * program does *not* advance. Work performed is never thrown away — three
 * sets before a gym closed are still three sets, and volume accounting
 * already counts only completed sets, so an abandoned session contributes
 * exactly what was done. The program stays where it is because the day
 * was not finished; the lifter can run it again or skip it.
 */

export interface AbandonWorkoutDeps {
  readonly workouts: WorkoutRepository
  readonly instances: InstanceRepository
  readonly clock: Clock
}

export type AbandonResult =
  /** Nothing had been logged, so the record was removed entirely. */
  | { readonly kind: 'discarded' }
  /** Work had been logged, so it was kept and marked abandoned. */
  | { readonly kind: 'kept'; readonly workout: WorkoutLog; readonly workingSets: number }
  | { readonly kind: 'not-found' }

export async function abandonWorkout(
  workoutId: WorkoutId,
  deps: AbandonWorkoutDeps,
): Promise<AbandonResult> {
  const workout = await deps.workouts.byId(workoutId)
  if (workout === undefined) return { kind: 'not-found' }

  const logged = totalWorkingSets(workout)

  if (logged === 0) {
    await deps.workouts.remove(workout.id)
    return { kind: 'discarded' }
  }

  const abandoned: WorkoutLog = {
    ...workout,
    status: 'abandoned',
    completedAt: deps.clock.now().toISOString(),
  }

  await deps.workouts.save(abandoned)
  return { kind: 'kept', workout: abandoned, workingSets: logged }
}
