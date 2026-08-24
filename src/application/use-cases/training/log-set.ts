import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { LoggedSet, SetOutcome, WorkoutLog } from '@/domain/logging/workout-log'
import { comparePerformance } from '@/domain/logging/workout-log'
import type { Clock, WorkoutRepository } from '@/domain/repositories/ports'

/**
 * Recording one set, and finding the number to suggest for the next.
 *
 * The suggestion is the part that matters. LiftTracker showed the same
 * set index from the same day of the previous microcycle as the input's
 * placeholder, which is a genuinely good idea — it makes beating last
 * week the path of least resistance, and it is preserved here. What is
 * not preserved is how it was computed: LiftTracker loaded every
 * microcycle the lifter had ever run, in memory, to find it.
 */

export interface LogSetDeps {
  readonly workouts: WorkoutRepository
  readonly clock: Clock
}

export interface SetResult {
  readonly load?: number
  readonly reps?: number
  readonly rpe?: number
  readonly outcome: SetOutcome
  readonly notes?: string
}

export interface LogSetRequest {
  readonly workoutId: WorkoutId
  readonly entryIndex: number
  readonly setIndex: number
  readonly result: SetResult
}

export async function logSet(request: LogSetRequest, deps: LogSetDeps): Promise<WorkoutLog> {
  const workout = await deps.workouts.byId(request.workoutId)
  if (workout === undefined) {
    throw new Error(`No workout found with id ${request.workoutId}.`)
  }

  const updated = updateSet(workout, request, deps.clock.now())
  await deps.workouts.save(updated)
  return updated
}

function updateSet(workout: WorkoutLog, request: LogSetRequest, now: Date): WorkoutLog {
  return {
    ...workout,
    entries: workout.entries.map((entry, entryIndex) => {
      if (entryIndex !== request.entryIndex) return entry

      return {
        ...entry,
        sets: entry.sets.map((set, setIndex) => {
          if (setIndex !== request.setIndex) return set
          return applyResult(set, request.result, now)
        }),
      }
    }),
  }
}

function applyResult(set: LoggedSet, result: SetResult, now: Date): LoggedSet {
  // Skipping clears any numbers that were entered, so a skipped set never
  // leaves a partial record that later reads as performed work.
  if (result.outcome === 'skipped') {
    return {
      prescription: set.prescription,
      ...(set.plannedLoad !== undefined ? { plannedLoad: set.plannedLoad } : {}),
      ...(set.plannedReps !== undefined ? { plannedReps: set.plannedReps } : {}),
      outcome: 'skipped',
      isWarmup: set.isWarmup,
      completedAt: now.toISOString(),
      ...(result.notes !== undefined ? { notes: result.notes } : {}),
    }
  }

  return {
    ...set,
    ...(result.load !== undefined ? { actualLoad: result.load } : {}),
    ...(result.reps !== undefined ? { actualReps: result.reps } : {}),
    ...(result.rpe !== undefined ? { actualRpe: result.rpe } : {}),
    outcome: result.outcome,
    completedAt: now.toISOString(),
    ...(result.notes !== undefined ? { notes: result.notes } : {}),
  }
}

/** Clears a set back to unperformed, without losing what was prescribed. */
export async function clearSet(
  request: Omit<LogSetRequest, 'result'>,
  deps: LogSetDeps,
): Promise<WorkoutLog> {
  const workout = await deps.workouts.byId(request.workoutId)
  if (workout === undefined) throw new Error(`No workout found with id ${request.workoutId}.`)

  const updated: WorkoutLog = {
    ...workout,
    entries: workout.entries.map((entry, entryIndex) =>
      entryIndex !== request.entryIndex
        ? entry
        : {
            ...entry,
            sets: entry.sets.map((set, setIndex) => {
              if (setIndex !== request.setIndex) return set
              return {
                prescription: set.prescription,
                ...(set.plannedLoad !== undefined ? { plannedLoad: set.plannedLoad } : {}),
                ...(set.plannedReps !== undefined ? { plannedReps: set.plannedReps } : {}),
                outcome: 'pending' as const,
                isWarmup: set.isWarmup,
              }
            }),
          },
    ),
  }

  await deps.workouts.save(updated)
  return updated
}

/* -------------------------------------------------------------------- */
/* What happened last time                                               */
/* -------------------------------------------------------------------- */

export interface PreviousSet {
  readonly load?: number
  readonly reps?: number
  readonly rpe?: number
  readonly date: string
}

/**
 * The same set index of the same exercise, the last time it was trained.
 *
 * Backed by the multi-entry exercise index rather than by a scan, and
 * limited to a handful of recent workouts because nothing older than that
 * is a useful suggestion.
 */
export async function previousSetFor(
  exerciseId: ExerciseId,
  setIndex: number,
  currentWorkoutId: WorkoutId,
  deps: LogSetDeps,
): Promise<PreviousSet | undefined> {
  const history = await deps.workouts.forExercise(exerciseId, 10)

  for (const workout of history) {
    if (workout.id === currentWorkoutId) continue

    const entry = workout.entries.find((candidate) => candidate.exerciseId === exerciseId)
    if (entry === undefined) continue

    const performed = entry.sets.filter((set) => !set.isWarmup && set.outcome === 'completed')
    const set = performed[setIndex]
    if (set?.actualLoad === undefined && set?.actualReps === undefined) continue

    return {
      ...(set.actualLoad !== undefined ? { load: set.actualLoad } : {}),
      ...(set.actualReps !== undefined ? { reps: set.actualReps } : {}),
      ...(set.actualRpe !== undefined ? { rpe: set.actualRpe } : {}),
      date: workout.date,
    }
  }

  return undefined
}

export type Comparison = ReturnType<typeof comparePerformance>

export function compareToPrevious(
  current: { readonly load?: number; readonly reps?: number },
  previous: PreviousSet | undefined,
): Comparison {
  if (previous === undefined) return 'incomparable'
  return comparePerformance(current, previous)
}
