import type { ExerciseId } from '@/domain/ids/ids'
import type { LogEntry, LoggedSet, WorkoutLog } from '@/domain/logging/workout-log'
import { roundLoad } from '@/domain/units/weight'

/**
 * Re-planning the back-offs from the top set that was actually performed.
 *
 * This is the half of RTS the app was missing. A top set is a
 * *measurement*: the whole reason the protocol asks for reps at an RPE is
 * that the lifter discovers what they have on the day, and everything
 * below is loaded from the answer. Deriving the back-off from
 * `estimatedMaxes` instead means deriving it from a guess made before the
 * session — which is the exact inversion that percentage-of-max training
 * makes, and the reason this app does not do percentage-of-max training.
 *
 * Concretely: a lifter whose estimate implied a 245 lb top set squats
 * 305 × 3, and the back-offs go on saying 235. Not merely stale — wrong
 * in the direction that makes the session pointless, because 235 is 23%
 * below the bar that was just moved rather than 5% below it, and no
 * amount of it will produce the fatigue the stopping rule is counting.
 *
 * The reps move too, and that is not cosmetic. The stopping rule is only
 * sayable because at *matched reps and RPE* an implied max is
 * proportional to bar weight — which is what makes "stop when the lighter
 * bar feels like the top set did" true arithmetic rather than a slogan.
 * A top set of three followed by back-offs of five compares implied maxes
 * at different rep counts and the equality quietly stops holding.
 *
 * Only `pending` sets are touched. A back-off already performed is a
 * record, and rewriting what it was "planned" to be would be falsifying
 * history to match a later reading.
 */

/**
 * The sub-categories a strength pair carries.
 *
 * Named here rather than matched as bare strings at each use. They are
 * written into every stored log, so they are effectively a wire format:
 * a typo in one comparison silently disables the re-plan rather than
 * failing, which is the worst way for this to break.
 */
export const TOP_SET_VARIANT = 'Top set'
export const BACKOFF_VARIANT = 'Back-off'

export interface ReplanOptions {
  readonly roundingIncrement: number
}

/** What a completed top set tells us, once it has actually been logged. */
interface TopSetReading {
  readonly load: number
  readonly reps: number
}

export function replanBackoffs(workout: WorkoutLog, options: ReplanOptions): WorkoutLog {
  const readings = new Map<ExerciseId, TopSetReading>()

  for (const entry of workout.entries) {
    if (entry.variant !== TOP_SET_VARIANT) continue
    const reading = readTopSet(entry)
    if (reading !== undefined) readings.set(entry.exerciseId, reading)
  }

  if (readings.size === 0) return workout

  /*
   * Identity is the change signal, at both levels.
   *
   * `replanSet` returns the set it was given when nothing moved, so an
   * entry whose sets are all identical is itself unchanged, and a workout
   * whose entries are all unchanged is returned as-is. That matters
   * beyond tidiness: this runs on every logged set, and a fresh object
   * every time would make React re-render the whole session and the
   * repository write a row that is byte-identical to the one already
   * there.
   */
  const entries = workout.entries.map((entry): LogEntry => {
    if (entry.variant !== BACKOFF_VARIANT) return entry

    const reading = readings.get(entry.exerciseId)
    if (reading === undefined) return entry

    const sets = entry.sets.map((set) => replanSet(set, reading, options))

    return sets.every((set, index) => set === entry.sets[index]) ? entry : { ...entry, sets }
  })

  return entries.every((entry, index) => entry === workout.entries[index])
    ? workout
    : { ...workout, entries }
}

/**
 * The reading a top-set entry yields, or nothing.
 *
 * Requires both numbers. A set logged with a weight and no reps cannot
 * say what the back-off should be, and inventing the missing half from
 * the plan would reintroduce the estimate through the back door.
 */
function readTopSet(entry: LogEntry): TopSetReading | undefined {
  for (const set of entry.sets) {
    if (set.outcome !== 'completed') continue
    if (set.actualLoad === undefined || set.actualReps === undefined) continue
    if (set.actualLoad <= 0 || set.actualReps <= 0) continue
    return { load: set.actualLoad, reps: set.actualReps }
  }

  return undefined
}

function replanSet(set: LoggedSet, reading: TopSetReading, options: ReplanOptions): LoggedSet {
  // Performed sets are history. Only an intention can be re-planned.
  if (set.outcome !== 'pending') return set

  // Guard on the prescription rather than on the variant alone: a
  // back-off slot carrying some other load kind is not asking to be
  // derived from the top set, and quietly overwriting it would make this
  // function's effect impossible to predict from the prescription.
  if (set.prescription.load.kind !== 'rts-backoff') return set

  const load = roundLoad(
    reading.load * (1 - set.prescription.load.dropPercent / 100),
    options.roundingIncrement,
  )

  if (set.plannedLoad === load && set.plannedReps === reading.reps) return set

  return { ...set, plannedLoad: load, plannedReps: reading.reps }
}
