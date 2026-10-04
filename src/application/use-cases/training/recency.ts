import type { ExerciseId } from '@/domain/ids/ids'
import { loggedVolume } from '@/domain/logging/workout-log'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { Clock, ExerciseRepository, WorkoutRepository } from '@/domain/repositories/ports'
import { toDayKey } from '@/domain/time/day'
import { muscleRecency, type MuscleRecency } from '@/domain/volume/recency'

export interface RecencyDeps {
  readonly workouts: WorkoutRepository
  readonly exercises: ExerciseRepository
  readonly clock: Clock
}

/**
 * Finished sessions counted per muscle by the week card's own rule
 * (`loggedVolume`), then read for how long ago each muscle last worked.
 */
export async function recentMuscles(
  deps: RecencyDeps,
): Promise<Readonly<Record<MuscleGroup, MuscleRecency>>> {
  const today = toDayKey(deps.clock.now())
  const [logs, library] = await Promise.all([deps.workouts.recent(60), deps.exercises.all()])
  const lookup = (id: ExerciseId) => library.find((exercise) => exercise.id === id)
  return muscleRecency(
    logs
      .filter((log) => log.status === 'completed')
      .map((log) => ({ date: log.date, volume: loggedVolume(log, lookup) })),
    today,
  )
}
