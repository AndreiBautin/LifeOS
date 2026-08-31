import { invariant } from '@/domain/errors/domain-error'
import {
  estimateOneRepMax,
  percentOfMaxAtRpe,
  RPE_CHART_MAX,
  RPE_CHART_MIN,
} from '@/domain/strength/one-rep-max'

/**
 * Reactive Training Systems — autoregulated strength work.
 *
 * Tuchscherer's system replaces percentage prescription with two numbers:
 * a **top set** at a target reps × RPE, and a **fatigue percent** that
 * governs how much back-off volume follows it.
 *
 * The load for the top set is not calculated. The lifter works up until
 * the set *feels* like the target RPE, which is what makes the system
 * autoregulating: on a bad day the same prescription produces a lighter
 * bar rather than a missed rep, and on a good day it produces a heavier
 * one rather than a wasted session.
 *
 * The consequence for the data model is that **the number of sets is not
 * known in advance.** It is discovered in the gym when the stopping rule
 * fires. Everything below is written to be evaluated set by set as the
 * session happens, not resolved up front.
 *
 * Fatigue is measured as the drop in *estimated one-rep max* across sets,
 * which is why the RPE chart in domain/strength is load-bearing here: it
 * is the only way to compare a set of five at RPE 8 against a set of three
 * at RPE 9 on a common scale.
 */

/**
 * How back-off volume is spent after the top set. Each produces a
 * different training effect from the same nominal fatigue percent.
 */
export const FATIGUE_METHODS = ['load-drop', 'repeats', 'rep-drop'] as const
export type FatigueMethod = (typeof FATIGUE_METHODS)[number]

export const FATIGUE_METHOD_LABELS: Record<FatigueMethod, string> = {
  'load-drop': 'Load drop — same reps, lighter bar',
  repeats: 'Repeats — same weight and reps until RPE climbs',
  'rep-drop': 'Rep drop — same weight, fewer reps',
}

export function describeFatigueMethod(method: FatigueMethod): string {
  switch (method) {
    case 'load-drop':
      return 'Drop the bar weight and keep the reps. Produces the most total rep volume, and the most muscular adaptation of the three.'
    case 'repeats':
      return 'Keep the same weight and reps and let the RPE climb. Builds work capacity, and the ability to grind at higher RPEs.'
    case 'rep-drop':
      return 'Keep the weight and let the reps fall. The highest average intensity, and the most neural of the three.'
  }
}

/**
 * Published guidance, as a named scale rather than a free number.
 *
 * The values are the accumulated drop in estimated max at which to stop:
 * roughly 0% for none, 2% minimal, 5% moderate, 7% high.
 */
export const FATIGUE_TARGETS = {
  none: 0,
  minimal: 2,
  moderate: 5,
  high: 7,
} as const

export type FatigueLevel = keyof typeof FATIGUE_TARGETS

/**
 * Roughly what one back-off set costs the implied max, as a percentage.
 *
 * An estimate, and named so it reads as one. It exists to answer *how
 * many back-off slots to put in the plan*, which is a different question
 * from when to stop — the stopping rule stays authoritative and fires on
 * the day's actual readings.
 */
export const DROP_PER_BACKOFF_PERCENT = 1.75

/**
 * How many back-off sets to plan for a fatigue target.
 *
 * **Reported: the back-offs always read the same however the fatigue
 * setting was moved.** They did — the count was a flat cap of three for
 * every non-zero target, so Minimal and High produced identical
 * sessions and the setting decided only when to stop.
 *
 * That is the same defect the `none` case was already fixed for,
 * arriving at a different point on the same scale: back-off slots are
 * materialised and counted as volume, so planning three at a 2% target
 * puts two sets in the plan that the stopping rule will cancel — and a
 * plan that is only correct if you skip most of it is not correct.
 *
 * Derived from the target rather than looked up, so the reason is
 * legible: at about {@link DROP_PER_BACKOFF_PERCENT} lost per set, a 2%
 * target is one set, 5% is three and 7% is four. **The floor is one**,
 * because any non-zero target needs at least one set to measure the drop
 * against.
 */
export function plannedBackoffSets(fatigueTargetPercent: number): number {
  if (fatigueTargetPercent <= 0) return 0

  return Math.max(1, Math.round(fatigueTargetPercent / DROP_PER_BACKOFF_PERCENT))
}

/**
 * The fatigue percent a lifter may choose: the four published points, and
 * only those.
 *
 * It was a free integer from 5 to 10, on the reasoning that somebody who
 * has run 7% and recovers from it knows something a general scale cannot.
 * True, and it made the setting into a slider over numbers that mean
 * nothing individually — there is no sense in which 8 is a step past 7,
 * because the published figures are *four named amounts of work*, not
 * samples from a continuum.
 *
 * So the choice is the scale. Naming each point is most of the value:
 * "moderate" is a decision a lifter can make, and 5 is a number they can
 * only accept.
 *
 * Zero is a real option and means the top set is the work — the stopping
 * rule fires immediately and no back-off sets are prescribed. It reads
 * oddly as a *load drop*, which the same number also is, and that is
 * consistent rather than broken: with nothing to drop to, there is
 * nothing to drop.
 */
export const FATIGUE_CHOICES: readonly {
  readonly level: FatigueLevel
  readonly percent: number
  readonly label: string
  readonly detail: string
}[] = [
  { level: 'none', percent: FATIGUE_TARGETS.none, label: 'None', detail: 'Top set only.' },
  {
    level: 'minimal',
    percent: FATIGUE_TARGETS.minimal,
    label: 'Minimal',
    detail: 'A back-off set or two.',
  },
  {
    level: 'moderate',
    percent: FATIGUE_TARGETS.moderate,
    label: 'Moderate',
    detail: 'The usual starting point.',
  },
  {
    level: 'high',
    percent: FATIGUE_TARGETS.high,
    label: 'High',
    detail: 'The most RTS publishes.',
  },
]

/**
 * The nearest published point to a stored number.
 *
 * Needed because the setting used to allow 5 to 10, so a device may hold
 * an 8 or a 9 — values that are no longer choices. Snapping is better
 * than clamping here: a stored 9 becomes "high" rather than being dragged
 * to the top of a range it was never on.
 */
export function nearestFatigueChoice(percent: number): number {
  return FATIGUE_CHOICES.reduce((closest, choice) =>
    Math.abs(choice.percent - percent) < Math.abs(closest.percent - percent) ? choice : closest,
  ).percent
}

export interface RtsPrescription {
  /** Reps for the top set. */
  readonly topSetReps: number
  /** RPE the top set should feel like — the load is found, not given. */
  readonly topSetRpe: number
  readonly method: FatigueMethod
  /** Accumulated estimated-max drop at which to stop, as a percentage. */
  readonly fatigueTargetPercent: number
  /** The drop applied to the bar for a load-drop protocol. */
  readonly loadDropPercent?: number
  /** Stops a runaway session when the stopping rule is slow to fire. */
  readonly maxBackoffSets: number
}

export const DEFAULT_RTS: RtsPrescription = {
  /*
   * Three, not five.
   *
   * The top set is a measurement before it is training — reps at an RPE,
   * read back through the chart as an implied max — and a triple sits
   * closer to the single the total is actually scored on, so less of the
   * chart's error is between what you lifted and what it says you can.
   *
   * It costs the other thing the top set was doing. Five reps at RPE 8 is
   * a real hypertrophy stimulus for the muscles the lift trains; three is
   * much less, and the back-offs are now carrying that alone. Worth
   * knowing if the chest or the quads start looking thin — the bench and
   * the squat pay them less than they did.
   */
  topSetReps: 3,
  topSetRpe: 8,
  method: 'load-drop',
  fatigueTargetPercent: FATIGUE_TARGETS.moderate,
  loadDropPercent: 5,
  maxBackoffSets: 6,
}

/* -------------------------------------------------------------------- */
/* Evaluating fatigue as the session happens                             */
/* -------------------------------------------------------------------- */

export interface PerformedSet {
  readonly load: number
  readonly reps: number
  readonly rpe: number
}

/**
 * The estimated one-rep max a set implies.
 *
 * Uses the RPE chart rather than a rep-only formula, because the whole
 * point is to compare sets performed at different proximities to failure.
 * A set of five at RPE 8 and a set of five at RPE 10 are not the same
 * evidence about maximal strength, and Epley alone cannot tell them apart.
 */
export function estimatedMaxFromSet(set: PerformedSet): number | undefined {
  const percent = percentOfMaxAtRpe(set.reps, set.rpe)

  if (percent === undefined) {
    // Outside the chart — fall back to a rep-only estimate, which is
    // less accurate but better than refusing to answer.
    const fallback = estimateOneRepMax(set.load, set.reps)
    return fallback.value
  }

  return Number(((set.load / percent) * 100).toFixed(2))
}

/**
 * How much estimated strength has been lost since the top set, as a
 * percentage. This is the number the fatigue target is compared against.
 */
export function accumulatedFatiguePercent(
  topSet: PerformedSet,
  latest: PerformedSet,
): number | undefined {
  const initial = estimatedMaxFromSet(topSet)
  const current = estimatedMaxFromSet(latest)

  if (initial === undefined || current === undefined || initial <= 0) return undefined

  // Negative means the lifter got *stronger* across sets, which happens
  // on a bad warm-up. Clamped to zero: it is not evidence of recovery,
  // it is evidence the top set was underrated.
  return Number(Math.max(0, ((initial - current) / initial) * 100).toFixed(2))
}

export interface FatigueState {
  readonly accumulatedPercent: number
  readonly backoffSetsDone: number
  readonly shouldStop: boolean
  readonly reason: string
}

/**
 * Whether to keep adding back-off sets.
 *
 * Called after each set. Three ways to stop, and the reason matters
 * because they mean different things to a lifter reading the screen.
 */
export function evaluateFatigue(
  prescription: RtsPrescription,
  topSet: PerformedSet,
  backoffs: readonly PerformedSet[],
): FatigueState {
  /*
   * Measured against the top set, including under a load drop.
   *
   * That looks wrong at first — a lighter bar implies a lower max before
   * any fatigue has accumulated, so the drop spends part of the
   * allowance by itself. It is the published rule, and it is coherent:
   * with a 5% drop and a 5% target you stop when the lighter weight
   * feels as hard as the top set did, which is precisely the point at
   * which the day's work is done. Re-baselining on the first back-off
   * would make the drop free and let every session run to its cap.
   */
  const latest = backoffs[backoffs.length - 1] ?? topSet
  const accumulated = accumulatedFatiguePercent(topSet, latest) ?? 0
  const done = backoffs.length

  if (prescription.fatigueTargetPercent <= 0) {
    return {
      accumulatedPercent: accumulated,
      backoffSetsDone: done,
      shouldStop: true,
      reason: 'No back-off work prescribed — the top set is the work.',
    }
  }

  if (accumulated >= prescription.fatigueTargetPercent) {
    return {
      accumulatedPercent: accumulated,
      backoffSetsDone: done,
      shouldStop: true,
      reason: `${accumulated.toFixed(1)}% off your top set — that is the target. Stop here.`,
    }
  }

  if (done >= prescription.maxBackoffSets) {
    return {
      accumulatedPercent: accumulated,
      backoffSetsDone: done,
      shouldStop: true,
      reason: `${String(prescription.maxBackoffSets)} back-off sets without reaching the fatigue target. Stop anyway — the top set was probably underrated.`,
    }
  }

  const remaining = prescription.fatigueTargetPercent - accumulated
  return {
    accumulatedPercent: accumulated,
    backoffSetsDone: done,
    shouldStop: false,
    reason: `${accumulated.toFixed(1)}% of ${String(prescription.fatigueTargetPercent)}% accumulated — roughly ${remaining > 3 ? 'two or more' : 'one more'} set to go.`,
  }
}

/**
 * The load to put on the bar for the next back-off set.
 *
 * Only the load-drop protocol changes the weight; repeats and rep-drops
 * hold it and let RPE or reps move instead.
 */
export function nextBackoffLoad(
  prescription: RtsPrescription,
  topSet: PerformedSet,
): number | undefined {
  switch (prescription.method) {
    case 'load-drop': {
      const drop = prescription.loadDropPercent ?? 5
      return Number((topSet.load * (1 - drop / 100)).toFixed(2))
    }
    case 'repeats':
    case 'rep-drop':
      return topSet.load
  }
}

/** The reps to aim for on the next back-off set. */
export function nextBackoffReps(
  prescription: RtsPrescription,
  topSet: PerformedSet,
  backoffs: readonly PerformedSet[],
): number {
  switch (prescription.method) {
    case 'load-drop':
    case 'repeats':
      return prescription.topSetReps
    case 'rep-drop': {
      // Reps fall as fatigue accumulates; the lifter stops when they can
      // no longer hit the target RPE at the prescribed count.
      const last = backoffs[backoffs.length - 1]
      return Math.max(1, (last?.reps ?? topSet.reps) - 1)
    }
  }
}

export function validateRtsPrescription(prescription: RtsPrescription): void {
  invariant(
    Number.isInteger(prescription.topSetReps) && prescription.topSetReps > 0,
    'RTS_REPS_INVALID',
    `A top set needs a positive whole number of reps, received ${String(prescription.topSetReps)}.`,
  )
  invariant(
    prescription.topSetRpe >= 6 && prescription.topSetRpe <= 10,
    'RTS_RPE_INVALID',
    `A top-set RPE must fall between 6 and 10, received ${String(prescription.topSetRpe)}.`,
  )
  invariant(
    prescription.fatigueTargetPercent >= 0 && prescription.fatigueTargetPercent <= 15,
    'RTS_FATIGUE_INVALID',
    `A fatigue target of ${String(prescription.fatigueTargetPercent)}% is outside the useful range; published guidance tops out around 7%.`,
  )
  invariant(
    prescription.maxBackoffSets > 0 && prescription.maxBackoffSets <= 15,
    'RTS_BACKOFF_CAP_INVALID',
    'The back-off cap must be a small positive number.',
  )
}

/* -------------------------------------------------------------------- */
/* Suggesting a starting load                                            */
/* -------------------------------------------------------------------- */

/**
 * A suggested opening load for a top set, from the most recent estimate.
 *
 * Explicitly a *suggestion*. RTS says the lifter finds the load by feel,
 * and overriding that with a number would reintroduce exactly the
 * rigidity the system exists to remove — but starting from a blank box
 * every session is its own kind of unhelpful.
 */
export function suggestTopSetLoad(
  estimatedMax: number | undefined,
  reps: number,
  rpe: number,
): number | undefined {
  if (estimatedMax === undefined || estimatedMax <= 0) return undefined

  const percent = percentOfMaxAtRpe(reps, rpe)
  if (percent === undefined) return undefined

  return Number((estimatedMax * (percent / 100)).toFixed(2))
}

/**
 * The RPE at which a back-off has spent the day's fatigue allowance.
 *
 * The stopping rule is a *fatigue percentage*: keep taking back-offs
 * until one implies a max some percent below the top set's. Correct, and
 * not a thing anyone can evaluate between sets with chalk on their hands
 * — it asks the lifter to run the RPE chart twice and compare.
 *
 * The same rule stated as an RPE is immediately actionable, and it is
 * derivable in advance because the top set's *weight cancels out*. Let
 * `p(r, x)` be the chart's percentage of max for `r` reps at RPE `x`.
 * Stopping when the implied max has fallen by `f` means
 *
 *     top × (1 − d) / p(r, x)  ≤  top / p(r, t) × (1 − f)
 *
 * and `top` divides out of both sides, leaving a condition on the chart
 * alone. So the answer depends only on the reps, the top-set RPE, the
 * load drop and the fatigue target — all of them known when the block is
 * assembled.
 *
 * Returns the *lowest* RPE that satisfies it, because that is the first
 * set at which the lifter should stop. Undefined when the reps fall
 * outside the chart, and `RPE_CHART_MAX` when no RPE reaches the target:
 * with a small drop and a large allowance you would fail before you got
 * there, and the set cap is what ends the block instead.
 */
export function backoffStopRpe(
  topSetReps: number,
  topSetRpe: number,
  dropPercent: number,
  fatiguePercent: number,
): number | undefined {
  const topPercent = percentOfMaxAtRpe(topSetReps, topSetRpe)
  if (topPercent === undefined) return undefined
  if (fatiguePercent >= 100) return undefined

  const required = (topPercent * (1 - dropPercent / 100)) / (1 - fatiguePercent / 100)

  for (let rpe = RPE_CHART_MIN; rpe <= RPE_CHART_MAX; rpe += 0.5) {
    const percent = percentOfMaxAtRpe(topSetReps, rpe)
    if (percent !== undefined && percent >= required) return rpe
  }

  return RPE_CHART_MAX
}
