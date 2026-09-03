import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId, IdGenerator, WorkoutId } from '@/domain/ids/ids'
import { asWorkoutId } from '@/domain/ids/ids'
import type { LogEntry, LoggedSet, WorkoutLog } from '@/domain/logging/workout-log'
import type { ProgramDay, ProgramTemplate, Slot } from '@/domain/programs/program'
import type {
  Clock,
  ExerciseRepository,
  PositionRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import type { ProgramPosition } from '@/domain/programs/position'
import { clampPosition, dayAt } from '@/application/use-cases/programs/current-program'
import { STARTING_POSITION } from '@/domain/programs/position'
import type { AthleteState } from '@/domain/resolution/resolve'
import { resolveSets } from '@/domain/resolution/resolve'
import { lastPerformance, nextLoad, stepFor } from '@/domain/programs/progression'
import type { RepRange } from '@/domain/programs/prescription'
import { matchesQuery } from '@/domain/exercises/exercise'

/**
 * Turning the next scheduled day into a workout that can be logged.
 *
 * The moment where the program stops being a template and becomes a
 * session. Resolution happens *here*, against the training maxes as they
 * are today, and the numbers are copied into the log as `plannedLoad` —
 * so a training max changed tomorrow does not retroactively alter what
 * yesterday's workout says it asked for.
 */

export interface StartWorkoutDeps {
  readonly workouts: WorkoutRepository
  readonly position: PositionRepository
  readonly exercises: ExerciseRepository
  readonly ids: IdGenerator
  readonly clock: Clock
}

export interface StartWorkoutRequest {
  readonly athlete: AthleteState
  readonly roundingIncrement: number
  /** The program, derived by the caller from the lifter's settings. */
  readonly program: ProgramTemplate
  /** Omit to start the active program's next day. */
  readonly freestyleTitle?: string
}

export type StartWorkoutResult =
  | { readonly kind: 'started'; readonly workout: WorkoutLog }
  | { readonly kind: 'resumed'; readonly workout: WorkoutLog }
  | { readonly kind: 'no-program'; readonly message: string }
  | { readonly kind: 'program-finished'; readonly message: string }

export async function startWorkout(
  request: StartWorkoutRequest,
  deps: StartWorkoutDeps,
): Promise<StartWorkoutResult> {
  // An unfinished session always wins. Starting a second one and leaving
  // the first orphaned is how a half-logged workout gets lost, and it is
  // the most common way a training app loses real data.
  const open = await deps.workouts.inProgress()
  if (open !== undefined) return { kind: 'resumed', workout: open }

  if (request.freestyleTitle !== undefined) {
    const workout = emptyWorkout(request.freestyleTitle, deps)
    await deps.workouts.save(workout)
    return { kind: 'started', workout }
  }

  const stored = await deps.position.get()
  const position = stored ?? { ...STARTING_POSITION, startedAt: deps.clock.now().toISOString() }

  // The program can change shape underneath a position — five days a week
  // becoming three — so the position is pulled back inside it first.
  const safe = clampPosition(request.program, position)
  const day = dayAt(request.program, safe)
  if (day === undefined) {
    return { kind: 'program-finished', message: 'This program has no scheduled days.' }
  }

  if (stored === undefined) await deps.position.save(safe)

  const library = await deps.exercises.all()

  /*
   * **The working loads are read here, at the one moment they matter.**
   * Double progression needs what you last lifted, which is history —
   * and `resolve` is pure and reads no repository. So the map is built
   * before resolution and handed to it through the athlete, the same way
   * the estimated maxes are.
   *
   * Only the exercises this session actually contains are looked up:
   * the whole catalogue would be fifty queries for a six-exercise day.
   */
  const working = await workingLoads(day, library, deps)
  const withHistory: StartWorkoutRequest = {
    ...request,
    athlete: { ...request.athlete, working },
  }

  const workout = buildFromDay(day, safe, withHistory, library, deps)
  await deps.workouts.save(workout)

  return { kind: 'started', workout }
}

function emptyWorkout(title: string, deps: StartWorkoutDeps): WorkoutLog {
  const now = deps.clock.now()
  return {
    id: asWorkoutId(deps.ids.next()),
    date: isoDate(now),
    startedAt: now.toISOString(),
    status: 'in-progress',
    title,
    entries: [],
  }
}

/**
 * What each exercise in the day is currently working at.
 *
 * **Read per exercise from its own last completed session**, not from a
 * stored number: there is no "current weight" record to drift or to
 * reconcile between two devices, and the log is already the truth about
 * what was lifted.
 *
 * An exercise with no history is simply absent, which resolves to an
 * open set — the lifter types what they did and it carries from then on.
 */
async function workingLoads(
  day: ProgramDay,
  library: readonly Exercise[],
  deps: StartWorkoutDeps,
): Promise<Readonly<Partial<Record<ExerciseId, number>>>> {
  const ids = [...new Set(day.slots.flatMap((slot) => resolveExercise(slot, library) ?? []))]

  const entries = await Promise.all(
    ids.map(async (id): Promise<readonly [ExerciseId, number][]> => {
      const exercise = library.find((one) => one.id === id)
      const history = await deps.workouts.forExercise(id, 1)
      const previous = history[0]?.entries.find((entry) => entry.exerciseId === id)
      if (previous === undefined || exercise === undefined) return []

      const last = lastPerformance(
        previous.sets
          .filter((set) => !set.isWarmup && set.outcome === 'completed')
          .map((set) => ({
            ...(set.actualLoad === undefined ? {} : { load: set.actualLoad }),
            ...(set.actualReps === undefined ? {} : { reps: set.actualReps }),
          })),
      )

      const range = rangeOf(previous.sets)
      const next = range === undefined ? last?.load : nextLoad(last, range, stepFor(exercise))

      return next === undefined ? [] : [[id, next]]
    }),
  )

  return Object.fromEntries(entries.flat())
}

/**
 * The range the previous session actually worked in.
 *
 * Read off the logged prescription rather than recomputed, because a
 * `WorkoutLog` describes itself — the rule that made the frozen program
 * snapshot unnecessary. A session logged before ranges existed simply
 * holds the load rather than progressing it.
 */
function rangeOf(sets: readonly LoggedSet[]): RepRange | undefined {
  const working = sets.find((set) => !set.isWarmup && set.prescription.reps.kind === 'range')
  const reps = working?.prescription.reps

  return reps?.kind === 'range' ? { low: reps.low, high: reps.high } : undefined
}

function buildFromDay(
  day: ProgramDay,
  position: ProgramPosition,
  request: StartWorkoutRequest,
  library: readonly Exercise[],
  deps: StartWorkoutDeps,
): WorkoutLog {
  const now = deps.clock.now()

  const entries = day.slots.flatMap((slot, order): LogEntry[] => {
    const exerciseId = resolveExercise(slot, library)
    // A slot whose query matches nothing is dropped with the rest of the
    // session intact. LiftTracker rendered such a slot as a blank row
    // prescribing zero, which reads as an answer rather than a gap.
    if (exerciseId === undefined) return []

    const resolved = resolveSets(slot.sets, {
      athlete: request.athlete,
      exerciseId,
      roundingIncrement: request.roundingIncrement,
    })

    const sets: LoggedSet[] = resolved.map((set) => {
      const reps = plannedReps(set.reps)
      return {
        prescription: set.prescription,
        ...(set.load !== undefined ? { plannedLoad: set.load } : {}),
        ...(reps !== undefined ? { plannedReps: reps } : {}),
        // A set starts life as an unrecorded intention. `completedAt`
        // being absent is what marks it as still to do — the outcome
        // field says what *kind* of thing it will be, not whether it
        // has happened.
        outcome: 'pending' as const,
        isWarmup: set.isWarmup,
      }
    })

    return [
      {
        exerciseId,
        role: slot.role,
        ...(slot.variant !== undefined ? { variant: slot.variant } : {}),
        slotId: slot.id,
        order,
        sets,
        ...(slot.notes !== undefined ? { notes: slot.notes } : {}),
      },
    ]
  })

  return {
    id: asWorkoutId(deps.ids.next()),
    position: {
      blockIndex: position.blockIndex,
      cycleNumber: position.cycleNumber,
      weekIndex: position.weekIndex,
      dayIndex: position.dayIndex,
    },
    date: isoDate(now),
    startedAt: now.toISOString(),
    status: 'in-progress',
    title: day.label,
    entries,
    ...(request.athlete.bodyweight !== undefined ? { bodyweight: request.athlete.bodyweight } : {}),
    // Frozen here rather than read back off the program, so a tally the
    // lifter is measuring against cannot move under them mid-session.
    ...(day.volumeTargets !== undefined ? { volumeTargets: day.volumeTargets } : {}),
  }
}

/**
 * A slot names an exercise, or describes one. The second form is what
 * lets a template stay valid in a gym with different equipment.
 */
function resolveExercise(slot: Slot, library: readonly Exercise[]): ExerciseId | undefined {
  if (slot.exercise.kind === 'specific') {
    const { exerciseId } = slot.exercise
    return library.some((exercise) => exercise.id === exerciseId) ? exerciseId : undefined
  }

  const { query } = slot.exercise
  return library.find((exercise) => matchesQuery(exercise, query))?.id
}

function plannedReps(reps: LoggedSet['prescription']['reps']): number | undefined {
  switch (reps.kind) {
    case 'fixed':
      return reps.reps
    case 'amrap':
      return reps.minimum
    case 'range':
      return reps.low
    case 'time':
      return undefined
  }
}

/** Local calendar date, not UTC — a 9pm workout belongs to that evening. */
export function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(year)}-${month}-${day}`
}

export function workoutIdOf(log: WorkoutLog): WorkoutId {
  return log.id
}
