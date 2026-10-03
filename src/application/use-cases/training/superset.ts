import type { WorkoutId } from '@/domain/ids/ids'
import { pairWithNext, unpair } from '@/domain/logging/superset'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { WorkoutRepository } from '@/domain/repositories/ports'

/**
 * Pairing an accessory with the next one as a superset, and splitting a
 * pair — two operations under two names, so a call site cannot ask for
 * one and get the other. See `domain/logging/superset.ts`.
 */
interface Deps {
  readonly workouts: WorkoutRepository
}

export async function pairSuperset(
  workoutId: WorkoutId,
  entryIndex: number,
  deps: Deps,
): Promise<WorkoutLog> {
  return change(workoutId, deps, (workout) => pairWithNext(workout, entryIndex))
}

export async function unpairSuperset(
  workoutId: WorkoutId,
  entryIndex: number,
  deps: Deps,
): Promise<WorkoutLog> {
  return change(workoutId, deps, (workout) => unpair(workout, entryIndex))
}

async function change(
  workoutId: WorkoutId,
  deps: Deps,
  apply: (workout: WorkoutLog) => WorkoutLog,
): Promise<WorkoutLog> {
  const workout = await deps.workouts.byId(workoutId)
  if (workout?.status !== 'in-progress') throw new Error('No open session to change.')
  const updated = apply(workout)
  if (updated !== workout) await deps.workouts.save(updated)
  return updated
}
