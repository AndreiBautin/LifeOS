import { invariant } from '@/domain/errors/domain-error'

/**
 * The low and high of a working range.
 *
 * Named because double progression is stated in one — "three sets of
 * 3–5" — and both the prescription and the progression rule have to say
 * the same thing about it.
 */
export interface RepRange {
  readonly low: number
  readonly high: number
}

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
   * **Whatever you last worked at, plus the step once you topped the
   * range.** Double progression, and the only load kind the redesigned
   * programme prescribes.
   *
   * It carries no number of its own, deliberately. The load is a fact
   * about your history rather than about the plan, so it is resolved
   * against the athlete — see `AthleteState.working` — and a slot that
   * has never been trained resolves to **open**: you type what you did,
   * and it carries from then on. Baking a number in here would make the
   * template a record of the past, which is the one thing a
   * `ProgramTemplate` must never be.
   */
  | { readonly kind: 'working' }
  /**
   * Autoregulated: work up to a target RPE.
   *
   * **Nothing prescribes this any more** — the programme is double
   * progression and no set is chosen by feel. It stays because **a log
   * describes itself**: every `WorkoutLog` embeds the prescription it
   * was performed under, so sessions filed while RTS ran still hold
   * `rpe` sets, and a history screen has to be able to read them.
   *
   * Removing the variant would not delete those records, it would make
   * them unreadable — the same reason the retired IndexedDB stores are
   * still declared. Do not "tidy" it away.
   */
  | { readonly kind: 'rpe'; readonly target: number }
  /**
   * An RTS back-off: a fixed drop from *today's* top set.
   *
   * Its own kind because a back-off is the one set in the app whose RPE
   * is an **output rather than an input**. You take the top-set weight
   * minus a fixed percentage, do the same reps, and record what it felt
   * like; the RPE climbs set over set as fatigue accumulates, and the
   * session ends when the implied max has fallen by the day's fatigue
   * target. Prescribing an RPE here inverts that — it says "reduce the
   * weight until this feels like a 7.5", which is a different exercise.
   *
   * It was prescribed as `{ kind: 'rpe', target: topSetRpe - 0.5 }` for a
   * while, and the tell was in the numbers: the slot claimed "Load drop
   * 5%" while suggesting a weight about 2% below the top set, because the
   * suggestion came from the RPE chart rather than from the drop. Half a
   * point of RPE is also not a distinction anyone can feel.
   *
   * The percentages are carried on the set so it resolves without
   * needing the slot: a log describes itself.
   */
  | {
      readonly kind: 'rts-backoff'
      /** How far below the top set, as a percentage of it. */
      readonly dropPercent: number
      /** The top set this descends from, for the suggested number. */
      readonly topSetReps: number
      readonly topSetRpe: number
      /**
       * The reading that ends the block, derived from the fatigue target.
       *
       * The rule is a fatigue percentage — stop when a set implies a max
       * some percent below the top set's — which is correct and not a
       * thing anyone can evaluate between sets. Stated as an RPE it is
       * the same rule and immediately actionable, and it is knowable in
       * advance because the top set's weight cancels out of the
       * comparison. See `backoffStopRpe`.
       */
      readonly stopRpe?: number
    }
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
  | ({ readonly kind: 'range' } & RepRange)
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
    case 'rts-backoff':
      invariant(
        Number.isFinite(load.dropPercent) && load.dropPercent >= 0 && load.dropPercent < 100,
        'BACKOFF_DROP_OUT_OF_RANGE',
        `A back-off drop must be between 0 and 100 percent, received ${String(load.dropPercent)}.`,
      )
      invariant(
        Number.isFinite(load.topSetRpe) && load.topSetRpe >= MIN_RPE && load.topSetRpe <= MAX_RPE,
        'RPE_OUT_OF_RANGE',
        `A top-set RPE must be between ${String(MIN_RPE)} and ${String(MAX_RPE)}, received ${String(load.topSetRpe)}.`,
      )
      return
    /*
     * Nothing to validate: `working` carries no number of its own. What
     * it resolves to is checked where it is read, against a history that
     * cannot be invalid — a load that was lifted is a load that exists.
     */
    case 'working':
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
export function describePrescription(
  set: SetPrescription,
  /**
   * The rep count actually being asked for, when it is no longer the one
   * written into the prescription.
   *
   * An RTS back-off matches the top set, so its rep target is not known
   * until the top set has been performed — the number frozen at assembly
   * is a projection. Once the measurement exists the row shows the real
   * one (`290 lb × 3`), and leaving this text saying "5 at 5% off the top
   * set" beside it puts two different rep counts on one line and makes
   * the reader work out which is binding.
   */
  plannedReps?: number,
): string {
  const reps =
    plannedReps === undefined
      ? describeReps(set.reps)
      : describeReps({ kind: 'fixed', reps: plannedReps })

  switch (set.load.kind) {
    case 'rpe':
      return `${reps} @ RPE ${String(set.load.target)}`
    /*
     * No RPE in the description, deliberately. Whatever this set feels
     * like is the reading the stopping rule uses — saying it in advance
     * would be saying the answer before the question.
     */
    case 'rts-backoff':
      return set.load.stopRpe === undefined
        ? `${reps} at ${String(set.load.dropPercent)}% off the top set`
        : `${reps} at ${String(set.load.dropPercent)}% off the top set, until RPE ${String(set.load.stopRpe)}`
    case 'open':
      return reps
    /*
     * **The reps alone, because the load is a fact about your history
     * rather than about the plan.** A template row cannot say what will
     * be on the bar — that is resolved per session — and printing
     * "working weight" here would be a phrase where a number belongs.
     * The session screen fills it in or leaves it open.
     */
    case 'working':
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
    case 'rts-backoff':
      return `${String(load.dropPercent)}% off the top set`
    case 'open':
      return '—'
    /* Nothing to show until a session resolves it against your history. */
    case 'working':
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
