import { rankSubstitutes, type Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { LogEntry, LoggedSet, WorkoutLog } from '@/domain/logging/workout-log'
import { lastPerformance, plannedRepsFor, type Performance } from '@/domain/programs/progression'
import type { LoadResets } from '@/domain/programs/stall'
import type { ExerciseRepository, WorkoutRepository } from '@/domain/repositories/ports'

import { planFromHistory, rangeOf } from './start-workout'

/**
 * Doing something else in the slot: the rack is taken, or a joint says
 * no to today's movement.
 *
 * **The log records what was done.** The entry is filed under the
 * exercise actually performed, with `substitutedFor` naming the one the
 * programme asked for — so the swapped exercise's own history grows, and
 * the programmed one's is not credited with a session it never had.
 *
 * **The weight comes from the swapped exercise's own history**, through
 * `planFromHistory`, the function Start uses: a dumbbell press is not a
 * barbell press at a discount, and guessing a ratio would be the app
 * inventing a number. With no history it opens with no weight, the same
 * as a first session of anything.
 *
 * **Sets already done stay where they were.** Swapping after two sets of
 * rows splits the entry: the rows keep their two, and the rest move to
 * the new exercise as a new entry beside it. Relabelling the logged sets
 * would file work under an exercise that never had it.
 */

export interface SwapExerciseDeps {
  readonly workouts: WorkoutRepository
  readonly exercises: ExerciseRepository
}

export interface SwapExerciseRequest {
  readonly workoutId: WorkoutId
  readonly entryIndex: number
  readonly exerciseId: ExerciseId
  readonly resets?: LoadResets
}

export async function swapExercise(
  request: SwapExerciseRequest,
  deps: SwapExerciseDeps,
): Promise<WorkoutLog> {
  const workout = await deps.workouts.byId(request.workoutId)
  if (workout?.status !== 'in-progress') throw new Error('No open session to swap in.')
  const entry = workout.entries[request.entryIndex]
  if (entry === undefined) throw new Error('No such exercise in this session.')
  if (entry.exerciseId === request.exerciseId) return workout

  const exercise = (await deps.exercises.all()).find((one) => one.id === request.exerciseId)
  if (exercise === undefined) throw new Error(`No exercise ${request.exerciseId}.`)

  const pending = entry.sets.filter((set) => set.outcome === 'pending')
  if (pending.length === 0) throw new Error('Every set of this exercise is already logged.')
  const started = entry.sets.some((set) => set.outcome === 'completed')

  const history = (await deps.workouts.forExercise(exercise.id, 10)).filter(
    (log) => log.id !== workout.id,
  )
  const plan = planFromHistory({
    exercise,
    variant: entry.variant,
    range: rangeOf(entry.sets),
    history,
    ...(request.resets !== undefined ? { resets: request.resets } : {}),
  })

  /*
   * Untouched, the whole slot moves — a skipped set included, because
   * "the rack was taken" is the commonest reason to have skipped one.
   * Started, only what is still to do moves.
   */
  const moving = started ? pending : entry.sets
  const sets = moving.map((set) => replanned(set, plan?.load, plan?.lastTime))

  /*
   * **Swapping back is not a substitution.** The programmed exercise is
   * the root of the chain, so a second swap still names it, and choosing
   * it again clears the mark rather than saying it substituted for itself.
   */
  const programmed = entry.substitutedFor ?? entry.exerciseId
  const { substitutedFor: _old, notes: _notes, ...rest } = entry
  const swapped: LogEntry = {
    ...rest,
    exerciseId: exercise.id,
    sets,
    ...(programmed === exercise.id ? {} : { substitutedFor: programmed }),
  }

  /*
   * **Swapping back after a split rejoins the slot.** The rows kept their
   * first two sets in the entry before; choosing rows again puts the rest
   * back under it rather than leaving the session with rows twice in a
   * row.
   */
  const before = workout.entries[request.entryIndex - 1]
  if (
    !started &&
    programmed === exercise.id &&
    before?.exerciseId === exercise.id &&
    before.slotId !== undefined &&
    before.slotId === entry.slotId
  ) {
    const rejoined = workout.entries.flatMap((one, at) =>
      at === request.entryIndex - 1
        ? [{ ...one, sets: [...one.sets, ...sets] }]
        : at === request.entryIndex
          ? []
          : [one],
    )
    const updated = { ...workout, entries: rejoined }
    await deps.workouts.save(updated)
    return updated
  }

  const entries = started
    ? [
        ...workout.entries.slice(0, request.entryIndex),
        { ...entry, sets: entry.sets.filter((set) => set.outcome !== 'pending') },
        swapped,
        ...workout.entries.slice(request.entryIndex + 1),
      ]
    : workout.entries.map((one, at) => (at === request.entryIndex ? swapped : one))

  const updated = { ...workout, entries }
  await deps.workouts.save(updated)
  return updated
}

function replanned(
  set: LoggedSet,
  load: number | undefined,
  lastTime: { readonly last: Performance; readonly bumped: boolean } | undefined,
): LoggedSet {
  const {
    plannedLoad: _load,
    plannedReps: _reps,
    actualLoad: _actualLoad,
    actualReps: _actualReps,
    completedAt: _at,
    ...rest
  } = set
  const reps = set.prescription.reps
  const plannedReps =
    reps.kind === 'range' && !set.isWarmup
      ? plannedRepsFor(lastTime?.last, reps, lastTime?.bumped ?? false)
      : set.plannedReps
  return {
    ...rest,
    outcome: 'pending',
    ...(load !== undefined && !set.isWarmup ? { plannedLoad: load } : {}),
    ...(plannedReps !== undefined ? { plannedReps } : {}),
  }
}

/** What a swap offers, best first, with what each did last time. */
export interface SwapOption {
  readonly exercise: Exercise
  /** The programmed exercise, offered to undo a swap. */
  readonly programmed: boolean
  readonly last: Performance | undefined
}

/**
 * The alternatives worth offering: **the same primary muscle**, ranked so
 * the same movement on other equipment comes first (`rankSubstitutes`).
 * A swap that changes the muscle is a different session rather than a
 * different tool for this one, so it is not offered here — and lifting
 * and conditioning are not offered for each other, or a squat's list
 * opens on the foam roller that also names the quads.
 */
export async function swapOptions(
  entry: LogEntry,
  deps: SwapExerciseDeps,
  limit = 6,
): Promise<readonly SwapOption[]> {
  const library = await deps.exercises.all()
  const current = library.find((one) => one.id === entry.exerciseId)
  if (current === undefined) return []
  const programmed =
    entry.substitutedFor === undefined
      ? undefined
      : library.find((one) => one.id === entry.substitutedFor)

  const ranked = rankSubstitutes(current, library)
    .filter(
      (one) =>
        one.primaryMuscle === current.primaryMuscle &&
        one.id !== programmed?.id &&
        // A foam roller shares the quads with a squat and is not a squat.
        (one.intent === 'conditioning') === (current.intent === 'conditioning'),
    )
    .slice(0, limit)
  const offered = programmed === undefined ? ranked : [programmed, ...ranked]

  return Promise.all(
    offered.map(async (exercise) => {
      const history = await deps.workouts.forExercise(exercise.id, 5)
      // The open session is not last time: the swap plans from before it.
      const previous = history
        .filter((log) => log.status !== 'in-progress')
        .flatMap((log) => log.entries)
        .find(
          (one) =>
            one.exerciseId === exercise.id &&
            one.sets.some((set) => !set.isWarmup && set.outcome === 'completed'),
        )
      const last =
        previous === undefined
          ? undefined
          : lastPerformance(
              previous.sets
                .filter((set) => !set.isWarmup && set.outcome === 'completed')
                .map((set) => ({
                  ...(set.actualLoad === undefined ? {} : { load: set.actualLoad }),
                  ...(set.actualReps === undefined ? {} : { reps: set.actualReps }),
                })),
              { bodyweight: exercise.loadBasis === 'bodyweight' },
            )
      return { exercise, programmed: exercise.id === programmed?.id, last }
    }),
  )
}
