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

/**
 * Five, on everything. It was three — _"straight 3 sets on anything"_ —
 * and moved to five on request: _"let's bump our sets up to 5 per
 * exercise."_ The routine lists one movement per muscle per day, so the
 * whole week's volume is this number times the list; nothing else needed
 * to change for it to land everywhere.
 */
export const STRAIGHT_SETS = 5

/**
 * A deload's sets: three of the five, roughly the usual 40% cut. It was
 * written as `STRAIGHT_SETS - 1`, which was a deload at three sets and
 * would be barely one at five.
 */
export const DELOAD_SETS = 3

/**
 * The competition lifts' range, and the only one stated here.
 *
 * The accessory ranges used to sit beside it — `COMPOUND_RANGE` at
 * 10–15 and `ISOLATION_RANGE` at 15–30 — and **neither had a caller
 * anywhere.** The assembler carries its own `COMPOUND_REPS` and
 * `ISOLATION_REPS`, which is where the fill actually reads them, so
 * these were a second copy that decided nothing.
 *
 * They had also drifted: the compounds moved to 5–10 when the accessory
 * volume was cut to three sets a week, and this copy stayed at 10–15.
 * A constant that looks authoritative, disagrees with the live one and
 * is read by nothing is the worst of the three states it can be in — it
 * is what somebody documenting the rep ranges would cite.
 */
export const STRENGTH_RANGE: RepRange = { low: 3, high: 5 }

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
  options: { readonly bodyweight?: boolean } = {},
): Performance | undefined {
  /*
   * **A bodyweight set has reps and no load, and still counts.** Pull-ups
   * and dips are logged with no weight, so requiring one read a month of
   * them as no history at all — the session planned nothing and showed
   * the bare range. For a bodyweight exercise a missing load is the body
   * alone, nought added; a belt's plates are the load.
   */
  const worked = sets.flatMap((set) => {
    const load = set.load ?? (options.bodyweight === true ? 0 : undefined)
    if (load === undefined || set.reps === undefined || set.reps <= 0) return []
    if (load <= 0 && options.bodyweight !== true) return []
    return [{ load, reps: set.reps }]
  })
  if (worked.length === 0) return undefined

  const load = Math.max(...worked.map((set) => set.load))

  return { load, reps: worked.filter((set) => set.load === load).map((set) => set.reps) }
}

/**
 * The one rep target for every set of an exercise: one more than the
 * weakest set last time, at the same load.
 *
 * **Straight sets, a straight target.** Asked for as _"it should always
 * just be a straight rep target across all sets. 5x16 then 5x17"_. It
 * planned per set — one past each set's own last result — which gave
 * 17, 17, 17, 16, 16 after a 16, 16, 16, 15, 15 session: five numbers for
 * one weight, where the method is one number to hit on every set.
 *
 * **One past the weakest set**, because that is the rep count the whole
 * exercise has not yet held. Five sets of sixteen with the last two at
 * fifteen is a session that has not done 5 × 16, so 5 × 16 is next; once
 * it has, 5 × 17.
 *
 * - **The load went up** (`bumped`, every set topped last time): back to
 *   the bottom of the range.
 * - **Capped at the top**: the target cannot pass the range; reaching it
 *   on every set is what raises the load.
 * - **Below the range, or no history**: the bottom of the range.
 */
export function plannedRepsFor(
  last: Performance | undefined,
  range: RepRange,
  bumped: boolean,
): number {
  if (last === undefined || bumped || last.reps.length === 0) return range.low

  const weakest = Math.min(...last.reps)
  return Math.min(range.high, Math.max(range.low, weakest + 1))
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
