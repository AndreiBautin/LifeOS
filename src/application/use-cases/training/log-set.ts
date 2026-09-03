import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { LoggedSet, SetOutcome, WorkoutLog } from '@/domain/logging/workout-log'
import { comparePerformance } from '@/domain/logging/workout-log'
import { replanAccessoryVolume } from '@/domain/volume/replan-accessories'
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
  /**
   * Needed because logging a top set re-plans the back-offs below it, and
   * the new bar weight has to land on plates the lifter owns.
   */
  readonly roundingIncrement: number
  /**
   * Needed because resizing the accessory work has to know what each
   * exercise trains. Taken as a function rather than a repository so the
   * use-case stays synchronous once the workout is loaded.
   */
  readonly exerciseFor: (id: ExerciseId) => Exercise | undefined
}

/**
 * **No RPE.** Nothing prescribes one and nothing reads a new one — double
 * progression moves the load from the reps — so the field went with the
 * form that collected it rather than being left as an input no call site
 * fills. `LoggedSet.actualRpe` stays: sessions logged under RTS carry
 * real readings and history still shows them.
 */
export interface SetResult {
  readonly load?: number
  readonly reps?: number
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
  /*
   * **The back-off re-plan is gone with RTS.** It rewrote the sets below
   * a top set once the top set was measured, which only meant anything
   * while a lift was a measurement plus derived work. Three straight
   * sets at a carried-forward load have nothing to re-plan: what the
   * next session lifts is decided by what this one logged, and that is
   * read when the session starts rather than rewritten as it runs.
   */
  const logged = updateSet(workout, request, deps.clock.now())

  /*
   * One re-plan left, where there were two. The other rewrote the load on
   * pending back-offs and went with them; this one rewrites the *number*
   * of pending accessory sets, which is a volume decision and has
   * nothing to do with how the load is chosen.
   */
  const updated = replanAccessoryVolume(logged, (id) => deps.exerciseFor(id))

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
  // Reads history and writes nothing, so it asks for the repository and
  // not for the writing use-case's dependencies. Taking `LogSetDeps` here
  // made a read-only query demand a rounding increment.
  deps: { readonly workouts: WorkoutRepository },
  /**
   * Which of the exercise's entries to compare against.
   *
   * One exercise can appear twice in a session — the competition lift is
   * a top-set slot and a back-off slot, deliberately. Matching on the
   * exercise alone took the *first* entry, so the first back-off was
   * shown the previous session's top set as its "last time": a heavier
   * number, silently, on the one row where the lifter is deciding what to
   * put on the bar.
   */
  variant?: string,
): Promise<PreviousSet | undefined> {
  const history = await deps.workouts.forExercise(exerciseId, 10)

  for (const workout of history) {
    if (workout.id === currentWorkoutId) continue

    const matching = workout.entries.filter((candidate) => candidate.exerciseId === exerciseId)

    // Falls back to the first entry when nothing matches — a workout
    // logged before entries carried a variant has only one anyway.
    const entry = matching.find((candidate) => candidate.variant === variant) ?? matching[0]
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
