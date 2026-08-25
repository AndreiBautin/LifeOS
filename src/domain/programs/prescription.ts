import { invariant } from '@/domain/errors/domain-error'

/**
 * How the load for one set is decided.
 *
 * This union is the reason a single program builder can express both
 * 5/3/1 and a Renaissance-Periodization-style hypertrophy block. Neither
 * of the two old apps could: LiftTracker prescribed load only as a target
 * RPE, which cannot say "85% of your training max", and StrengthFlow
 * prescribed nothing at all — it carried the last weight forward.
 *
 * Adding a variant here is how the app learns a new style of programming.
 * Every consumer switches exhaustively (enforced by
 * `switch-exhaustiveness-check`), so a new variant fails the build until
 * it is handled everywhere.
 */
export type LoadSource =
  /**
   * A percentage of the 1RM estimated from logged history.
   *
   * There used to be a `percent-training-max` variant beside this one,
   * because the whole of 5/3/1 was expressed with it and resolving it
   * against an estimate instead would have silently changed what a cycle
   * meant. Nothing prescribes against a training max now that strength is
   * run by RTS, so the variant went with the framework.
   */
  | { readonly kind: 'percent-e1rm'; readonly percent: number }
  /**
   * Bodyweight, optionally plus added load. Pull-ups and dips are the
   * cases; LiftTracker had a `Bodyweight` equipment type but no way to
   * prescribe added weight.
   */
  | { readonly kind: 'bodyweight'; readonly addedLoad?: number }
  /** A fixed number, unit-of-the-program. */
  | { readonly kind: 'absolute'; readonly load: number }
  /**
   * Autoregulated: work up to a target RPE. This is how LiftTracker
   * prescribed everything, and it stays the right choice for accessories
   * where a percentage of anything is meaningless.
   */
  | { readonly kind: 'rpe'; readonly target: number }
  /**
   * No prescription — the lifter decides, and the app suggests based on
   * last time. StrengthFlow's implicit default, made explicit.
   */
  | { readonly kind: 'open' }

/**
 * How many reps the set asks for.
 */
export type RepTarget =
  | { readonly kind: 'fixed'; readonly reps: number }
  | { readonly kind: 'range'; readonly low: number; readonly high: number }
  /**
   * As many reps as possible, with a stated minimum — Wendler's "5+".
   * Neither old app could express this, which is the single clearest
   * reason neither could run 5/3/1: the AMRAP set *is* the progression
   * signal.
   */
  | { readonly kind: 'amrap'; readonly minimum: number }
  /** Timed rather than counted — planks, carries. */
  | { readonly kind: 'time'; readonly seconds: number }

/** One prescribed set. */
export interface SetPrescription {
  readonly load: LoadSource
  readonly reps: RepTarget
  /**
   * A warm-up set is prescribed and displayed but excluded from volume
   * accounting and from e1RM estimation. 5/3/1's first two main sets are
   * working sets; the ramp before them is not.
   */
  readonly isWarmup?: boolean
  /**
   * What this set is for, when that differs from the sets around it.
   *
   * "Top set" and "Back-off" are the same exercise at the same rack, so
   * they belong in one slot — but they are not interchangeable, and the
   * lifter needs to know which one they are standing under. The
   * distinction lives on the set rather than on the slot for exactly that
   * reason.
   */
  readonly label?: string
  readonly notes?: string
}

export const MAX_PERCENT = 200
export const MIN_RPE = 4
export const MAX_RPE = 10

export function validateLoadSource(load: LoadSource): void {
  switch (load.kind) {
    case 'percent-e1rm':
      invariant(
        Number.isFinite(load.percent) && load.percent > 0 && load.percent <= MAX_PERCENT,
        'PERCENT_OUT_OF_RANGE',
        `A load percentage must be between 0 and ${String(MAX_PERCENT)}, received ${String(load.percent)}.`,
      )
      return
    case 'absolute':
      invariant(
        Number.isFinite(load.load) && load.load >= 0,
        'ABSOLUTE_LOAD_NEGATIVE',
        `An absolute load must be zero or more, received ${String(load.load)}.`,
      )
      return
    case 'bodyweight':
      invariant(
        load.addedLoad === undefined || Number.isFinite(load.addedLoad),
        'ADDED_LOAD_INVALID',
        'Added bodyweight load must be a finite number.',
      )
      return
    case 'rpe':
      invariant(
        Number.isFinite(load.target) && load.target >= MIN_RPE && load.target <= MAX_RPE,
        'RPE_OUT_OF_RANGE',
        `A target RPE must be between ${String(MIN_RPE)} and ${String(MAX_RPE)}, received ${String(load.target)}.`,
      )
      return
    case 'open':
      return
  }
}

export function validateRepTarget(reps: RepTarget): void {
  switch (reps.kind) {
    case 'fixed':
      invariant(
        Number.isInteger(reps.reps) && reps.reps > 0,
        'REPS_NOT_POSITIVE',
        `A fixed rep target must be a positive whole number, received ${String(reps.reps)}.`,
      )
      return
    case 'range':
      invariant(
        Number.isInteger(reps.low) && Number.isInteger(reps.high) && reps.low > 0,
        'REP_RANGE_NOT_INTEGER',
        'A rep range must be built from positive whole numbers.',
      )
      invariant(
        reps.low <= reps.high,
        'REP_RANGE_INVERTED',
        `A rep range cannot start above where it ends (${String(reps.low)}–${String(reps.high)}).`,
      )
      return
    case 'amrap':
      invariant(
        Number.isInteger(reps.minimum) && reps.minimum > 0,
        'AMRAP_MINIMUM_INVALID',
        `An AMRAP set needs a positive minimum, received ${String(reps.minimum)}.`,
      )
      return
    case 'time':
      invariant(
        Number.isFinite(reps.seconds) && reps.seconds > 0,
        'TIMED_SET_INVALID',
        `A timed set needs a positive duration, received ${String(reps.seconds)}.`,
      )
      return
  }
}

export function validateSetPrescription(set: SetPrescription): void {
  validateLoadSource(set.load)
  validateRepTarget(set.reps)
}

/**
 * Renders a prescription the way a lifter would read it: "5 @ RPE 8".
 *
 * Reps first, effort as a qualifier. Rendering it load-first produced
 * "RPE 9 × 3–8", which reads as a multiplication of two unrelated
 * quantities and put the number the lifter has to *do* at the end. An
 * RPE is not a weight, so it does not belong in the "weight × reps"
 * position that every training log has used for a century.
 */
export function describePrescription(set: SetPrescription): string {
  const reps = describeReps(set.reps)

  switch (set.load.kind) {
    case 'rpe':
      return `${reps} @ RPE ${String(set.load.target)}`
    case 'open':
      return reps
    // Enumerated rather than defaulted, so adding a load kind fails the
    // build here and someone decides how it should read.
    case 'percent-e1rm':
    case 'bodyweight':
    case 'absolute':
      return `${describeLoad(set.load)} × ${reps}`
  }
}

export function describeLoad(load: LoadSource): string {
  switch (load.kind) {
    case 'percent-e1rm':
      return `${String(load.percent)}% e1RM`
    case 'bodyweight':
      return load.addedLoad !== undefined && load.addedLoad !== 0
        ? `BW +${String(load.addedLoad)}`
        : 'BW'
    case 'absolute':
      return String(load.load)
    case 'rpe':
      return `RPE ${String(load.target)}`
    case 'open':
      return '—'
  }
}

export function describeReps(reps: RepTarget): string {
  switch (reps.kind) {
    case 'fixed':
      return String(reps.reps)
    case 'range':
      return `${String(reps.low)}–${String(reps.high)}`
    case 'amrap':
      return `${String(reps.minimum)}+`
    case 'time':
      return describeSeconds(reps.seconds)
  }
}

/**
 * A duration a lifter reads at a glance.
 *
 * Seconds below a minute, because that is how a plank or a carry is
 * counted; minutes above it, because "1200s" is a number to be converted
 * rather than read, and conditioning is prescribed in minutes.
 */
function describeSeconds(seconds: number): string {
  if (seconds < 60) return `${String(seconds)}s`

  const minutes = seconds / 60
  return Number.isInteger(minutes)
    ? `${String(minutes)} min`
    : `${String(Math.floor(minutes))}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * The number of reps to plan for when a target is not a single number.
 * Used for volume projection, never for what is displayed to the lifter —
 * showing "10" where the prescription says "8–12" would quietly turn a
 * range into a target.
 */
export function nominalReps(reps: RepTarget): number {
  switch (reps.kind) {
    case 'fixed':
      return reps.reps
    case 'range':
      return Math.round((reps.low + reps.high) / 2)
    case 'amrap':
      return reps.minimum
    case 'time':
      return 0
  }
}
