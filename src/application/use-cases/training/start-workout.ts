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
import { scheduleFor } from '@/application/use-cases/programs/schedule'
import { STARTING_POSITION } from '@/domain/programs/position'
import type { AthleteState } from '@/domain/resolution/resolve'
import { resolveSets } from '@/domain/resolution/resolve'
import {
  lastPerformance,
  nextLoad,
  plannedRepsFor,
  stepFor,
  type Performance,
} from '@/domain/programs/progression'
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

  /*
   * **The calendar decides the day.** Today's session until it is done,
   * then the next one the week holds — so starting on a rest day, or
   * after today's is filed, opens tomorrow's early rather than nothing.
   * See `domain/programs/schedule.ts`.
   */
  const schedule = await scheduleFor(request.program, deps)
  const scheduled = schedule.next
  if (scheduled === undefined) {
    return { kind: 'program-finished', message: 'This program has no scheduled days.' }
  }
  const day = scheduled.day

  /*
   * The block's Monday is written down the first time it is needed, so a
   * device reading a cursor-era position settles on one answer rather
   * than re-deriving it from a stamp that later saves would move.
   */
  const stored = await deps.position.get()
  if (stored?.blockStartedOn === undefined) {
    await deps.position.save({
      ...(stored ?? { ...STARTING_POSITION, startedAt: deps.clock.now().toISOString() }),
      cycleNumber: scheduled.cycleNumber,
      blockIndex: scheduled.blockIndex,
      weekIndex: scheduled.weekIndex,
      dayIndex: scheduled.dayIndex,
      blockStartedOn: schedule.blockStartedOn,
    })
  }

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
  const { working, history } = await workingLoads(day, library, request, deps)
  const withHistory: StartWorkoutRequest = {
    ...request,
    athlete: { ...request.athlete, working },
  }

  const workout = buildFromDay(day, scheduled, withHistory, library, deps, history)
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
 * **With no history, a strength slot is seeded from its estimated max
 * and everything else is left open.** A first bench session can open at
 * a weight the lifter themselves stated, where a first curl would have to
 * open at a number the app invented. It holds for exactly one session
 * either way: the moment something is logged, the log is the source.
 *
 * The restriction to strength slots is the load-bearing half, and it is
 * not about which lifts happen to carry an estimate. A share of a one-rep
 * max is only meaningful against a rep count — 85% is about a five-rep
 * load, which is the strength range and is nowhere near a set of twenty.
 * Turning an estimate into a load for an arbitrary range needs the RPE
 * chart, which is exactly what went with RTS.
 */
async function workingLoads(
  day: ProgramDay,
  library: readonly Exercise[],
  request: StartWorkoutRequest,
  deps: StartWorkoutDeps,
): Promise<{
  readonly working: Readonly<Partial<Record<ExerciseId, number>>>
  readonly history: Readonly<Partial<Record<ExerciseId, LastTime>>>
}> {
  const ids = [...new Set(day.slots.flatMap((slot) => resolveExercise(slot, library) ?? []))]
  const strengthIds = new Set(
    day.slots
      .filter((slot) => slot.role === 'strength')
      .flatMap((slot) => resolveExercise(slot, library) ?? []),
  )

  const entries = await Promise.all(
    ids.map(async (id): Promise<readonly [ExerciseId, number, LastTime | undefined][]> => {
      const exercise = library.find((one) => one.id === id)
      const history = await deps.workouts.forExercise(id, 1)
      const previous = history[0]?.entries.find((entry) => entry.exerciseId === id)
      if (exercise === undefined) return []
      if (previous === undefined) {
        const seeded = strengthIds.has(id) ? firstSessionLoad(id, request) : undefined
        return seeded === undefined ? [] : [[id, seeded, undefined]]
      }

      const last = lastPerformance(
        previous.sets
          .filter((set) => !set.isWarmup && set.outcome === 'completed')
          .map((set) => ({
            ...(set.actualLoad === undefined ? {} : { load: set.actualLoad }),
            ...(set.actualReps === undefined ? {} : { reps: set.actualReps }),
          })),
        { bodyweight: exercise.loadBasis === 'bodyweight' },
      )

      /*
       * **Topped against today's range, not the one last time was logged
       * under.** They differ when a range changes — dips went from 5–10 to
       * 5–30 — and judged by the old one, twelve dips read as topped and
       * the next session put a belt on at five reps, the opposite of what
       * widening the range asked for. The previous log's range is the
       * fallback for an exercise today's day no longer prescribes a range
       * for.
       */
      const range = rangeToday(day, id, library) ?? rangeOf(previous.sets)
      /*
       * Topped against the sets *that* session asked for, read off its
       * own log. Measured against today's count instead, every session
       * logged before the move from three sets to five could never earn
       * an increment — three sets of five is not five sets of five, and
       * it was never asked to be.
       */
      const asked = Math.max(1, previous.sets.filter((set) => !set.isWarmup).length)
      const next =
        range === undefined ? last?.load : nextLoad(last, range, stepFor(exercise), asked)

      if (next === undefined) return []
      return [[id, next, last === undefined ? undefined : { last, bumped: next > last.load }]]
    }),
  )

  const found = entries.flat()
  return {
    working: Object.fromEntries(found.map(([id, load]) => [id, load])),
    history: Object.fromEntries(
      found.flatMap(([id, , lastTime]) => (lastTime === undefined ? [] : [[id, lastTime]])),
    ),
  }
}

/** The rep range today's day prescribes for an exercise, if any. */
function rangeToday(
  day: ProgramDay,
  id: ExerciseId,
  library: readonly Exercise[],
): RepRange | undefined {
  const slot = day.slots.find((one) => resolveExercise(one, library) === id)
  const reps = slot?.sets.find((set) => set.isWarmup !== true)?.reps
  return reps?.kind === 'range' ? { low: reps.low, high: reps.high } : undefined
}

/** What an exercise did last time, and whether its load has gone up since. */
interface LastTime {
  readonly last: Performance
  readonly bumped: boolean
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
  position: Pick<ProgramPosition, 'cycleNumber' | 'blockIndex' | 'weekIndex' | 'dayIndex'>,
  request: StartWorkoutRequest,
  library: readonly Exercise[],
  deps: StartWorkoutDeps,
  history: Readonly<Partial<Record<ExerciseId, LastTime>>> = {},
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

    /*
     * **One rep target for every set, aimed past last time**: one more
     * than the weakest set managed, at the same load, capped at the top
     * of the range — and back to the bottom once the load has gone up.
     * See `plannedRepsFor`.
     */
    const lastTime = history[exerciseId]
    const sets: LoggedSet[] = resolved.map((set) => {
      const reps =
        !set.isWarmup && set.reps.kind === 'range'
          ? plannedRepsFor(lastTime?.last, set.reps, lastTime?.bumped ?? false)
          : plannedReps(set.reps)
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

/**
 * Where a lift opens when it has never been logged here.
 *
 * A percentage of the estimated max at the top of the strength range —
 * conservative on purpose, because the first set of a first session is
 * the worst moment to be handed an optimistic number. It is a suggestion
 * like any other and the lifter overwrites it by loading the bar they
 * were going to load anyway.
 *
 * Only ever asked about a strength slot — see `workingLoads` — so the
 * share is always read against the strength range. Absent for anything
 * with no estimate.
 */
const FIRST_SESSION_SHARE = 0.85

function firstSessionLoad(id: ExerciseId, request: StartWorkoutRequest): number | undefined {
  const basis = request.athlete.estimatedMaxes[id]
  if (basis === undefined) return undefined
  return basis * FIRST_SESSION_SHARE
}
