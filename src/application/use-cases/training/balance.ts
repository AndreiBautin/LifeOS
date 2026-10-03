import type { ExerciseId } from '@/domain/ids/ids'
import { loggedVolume } from '@/domain/logging/workout-log'
import type { Clock, ExerciseRepository, WorkoutRepository } from '@/domain/repositories/ports'
import { mondayOf, shiftDay, toDayKey } from '@/domain/time/day'
import { sumVolume } from '@/domain/volume/accounting'
import { balanceOf, type PairBalance } from '@/domain/volume/balance'

/** Calendar weeks the balance reads: this one and the three before. */
export const BALANCE_WEEKS = 4

export interface BalanceDeps {
  readonly workouts: WorkoutRepository
  readonly exercises: ExerciseRepository
  readonly clock: Clock
}

/**
 * The last four calendar weeks of finished sessions, counted per muscle
 * by the week card's own rule (`loggedVolume`) and paired up
 * (`balanceOf`). Weeks run Monday to Sunday, like every other week here.
 */
export async function muscleBalance(deps: BalanceDeps): Promise<readonly PairBalance[]> {
  const today = toDayKey(deps.clock.now())
  const first = shiftDay(mondayOf(today), -7 * (BALANCE_WEEKS - 1))
  const [logs, library] = await Promise.all([deps.workouts.recent(200), deps.exercises.all()])
  const lookup = (id: ExerciseId) => library.find((exercise) => exercise.id === id)
  const finished = logs.filter(
    (log) => log.status === 'completed' && log.date >= first && log.date <= today,
  )

  const weeks = Array.from({ length: BALANCE_WEEKS }, (_, at) => {
    const monday = shiftDay(first, at * 7)
    const sunday = shiftDay(monday, 6)
    return sumVolume(
      finished
        .filter((log) => log.date >= monday && log.date <= sunday)
        .map((log) => loggedVolume(log, lookup)),
    )
  })
  return balanceOf(weeks)
}
