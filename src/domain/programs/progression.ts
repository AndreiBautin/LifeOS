import type { RepRange } from './prescription'

/**
 * Double progression: the reps climb, then the load does.
 *
 * Asked for as _"let's just do a double progression for everything. No
 * RPE or anything… Straight 3 sets on anything."_ It replaces RTS
 * wholesale, and the trade is deliberate: RTS moved the load set by set
 * from a self-reported RPE, and this moves it session by session from
 * what was actually logged. One is a reading of how a set felt; the
 * other is a count of reps that happened.
 *
 * **The whole rule is two sentences.** Work in a rep range for a fixed
 * number of sets. When every set reaches the top of the range, put the
 * next increment on the bar and start again at the bottom.
 *
 * **Nothing here is stored.** The working load is derived from the last
 * session that trained the exercise, the way the programme itself is
 * derived from settings — so there is no "current weight" record to
 * drift, to lose, or to reconcile between two devices. The one thing the
 * app must not do is write a number back that the lifter did not lift,
 * which is the rule `WorkoutLog` was built around.
 */

/** Three, on everything. */
export const STRAIGHT_SETS = 3

export const STRENGTH_RANGE: RepRange = { low: 3, high: 5 }
export const COMPOUND_RANGE: RepRange = { low: 10, high: 15 }
export const ISOLATION_RANGE: RepRange = { low: 15, high: 30 }

/**
 * What the last session did on one exercise.
 *
 * Reps per completed working set, at one load. A session where the load
 * varied between sets is read at its heaviest — see `lastPerformance`.
 */
export interface Performance {
  readonly load: number
  readonly reps: readonly number[]
}

/**
 * Whether that performance earns the next increment.
 *
 * **Every set at or above the top of the range**, and there must be at
 * least as many sets as were asked for. Two sets of fifteen out of three
 * is not a completed prescription, and treating it as one would add load
 * for a session that was cut short.
 *
 * At *or above*: a set that overshoots the top of the range has more
 * than earned it, and refusing the increment because somebody did 16
 * instead of 15 would be the app being pedantic about its own bookkeeping.
 */
export function topped(last: Performance, range: RepRange, sets = STRAIGHT_SETS): boolean {
  return last.reps.length >= sets && last.reps.every((reps) => reps >= range.high)
}

/**
 * The load to put on the bar next.
 *
 * **Absent means open**, and that is the design rather than a gap: with
 * no history the app does not know what you lift, and inventing a number
 * from an estimate would be a prescription nobody chose. You type what
 * you did, and it carries from then on.
 */
export function nextLoad(
  last: Performance | undefined,
  range: RepRange,
  step: number,
  sets = STRAIGHT_SETS,
): number | undefined {
  if (last === undefined) return undefined

  return topped(last, range, sets) ? last.load + step : last.load
}

/**
 * The performance to progress from, out of a session's logged sets.
 *
 * **The heaviest load, and only the sets at it.** A session can hold
 * warm-ups and the occasional dropped set, and averaging across them
 * would progress off a number nobody worked at. Taking the top load and
 * the reps done at it is the reading a lifter would give if asked what
 * they did.
 */
export function lastPerformance(
  sets: readonly { readonly load?: number; readonly reps?: number }[],
): Performance | undefined {
  const worked = sets.filter(
    (set): set is { load: number; reps: number } =>
      set.load !== undefined && set.load > 0 && set.reps !== undefined && set.reps > 0,
  )
  if (worked.length === 0) return undefined

  const load = Math.max(...worked.map((set) => set.load))

  return { load, reps: worked.filter((set) => set.load === load).map((set) => set.reps) }
}

/**
 * How much goes on when the range is topped.
 *
 * **Five on upper, ten on lower**, which is the split asked for and the
 * one the plates make anyway: a squat can take a ten-pound jump every
 * session for months and a lateral raise cannot.
 *
 * **Derived from the movement rather than written on every exercise.**
 * Fifty-odd entries would each need a number, and forty-eight of them
 * would say five — a field that repeats itself is a field that drifts.
 * `loadStep` overrides it where a movement genuinely differs, which is
 * the same escape hatch `repRange` is.
 */
export const UPPER_STEP = 5
export const LOWER_STEP = 10

/** The muscles a ten-pound jump belongs to. */
const LOWER_MUSCLES: readonly string[] = ['quads', 'hamstrings', 'glutes', 'calves']

export function stepFor(exercise: {
  readonly loadStep?: number
  readonly primaryMuscle: string
  readonly isCompound?: boolean
}): number {
  if (exercise.loadStep !== undefined) return exercise.loadStep

  /*
   * Compound *and* lower. A calf raise is a lower-body movement and an
   * isolation, and ten pounds a session on one is a jump nobody makes —
   * so the two conditions are both required rather than either.
   */
  return exercise.isCompound === true && LOWER_MUSCLES.includes(exercise.primaryMuscle)
    ? LOWER_STEP
    : UPPER_STEP
}
