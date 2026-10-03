import { setSeconds } from '@/domain/programs/program'
import { restAfter, type RestWork } from '@/domain/programs/rest'

import type { LogEntry, WorkoutLog } from './workout-log'

/**
 * How much of the session is left, in seconds: every pending set's work
 * and the rest after it, by the same costs the planner uses (`setSeconds`)
 * and the same rest the timer will start (`restAfter`).
 *
 * **It is what the plan says, not a measurement of the lifter** — a
 * session run slower than its rests reads late, and the finish time moves
 * as it is.
 */
export function remainingSeconds(
  workout: WorkoutLog,
  workOf: (entry: LogEntry) => RestWork,
): number {
  return workout.entries.reduce((total, entry) => {
    const rest = restAfter({ work: workOf(entry), lastOfExercise: false }).seconds
    return (
      total +
      entry.sets
        .filter((set) => set.outcome === 'pending')
        .reduce(
          (sum, set) => sum + setSeconds({ ...set.prescription, isWarmup: set.isWarmup }, rest),
          0,
        )
    )
  }, 0)
}
