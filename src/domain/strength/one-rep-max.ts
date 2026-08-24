import { invariant } from '@/domain/errors/domain-error'

/**
 * Estimating a one-rep max from a set that was not a single.
 *
 * StrengthFlow computed this inline with Epley (`weight * (1 + reps / 30)`)
 * inside a chart-building loop and used it for nothing else. It is far
 * more load-bearing here: a 5/3/1 AMRAP set is a max-effort test by
 * design, so every cycle produces three fresh estimates, and those
 * estimates are what "working up to a new 1RM" actually means between
 * dedicated test days.
 *
 * All of these formulas degrade past about ten reps — they are fitted to
 * low-rep work and a twenty-rep set says more about conditioning than
 * about maximal strength. `estimateOneRepMax` reports that rather than
 * quietly returning a confident wrong number.
 */

export const E1RM_FORMULAS = ['epley', 'brzycki', 'lombardi'] as const
export type E1rmFormula = (typeof E1RM_FORMULAS)[number]

export const E1RM_FORMULA_LABELS: Record<E1rmFormula, string> = {
  epley: 'Epley',
  brzycki: 'Brzycki',
  lombardi: 'Lombardi',
}

/** Past this many reps an estimate is reported as low confidence. */
export const RELIABLE_REP_CEILING = 10

export interface E1rmEstimate {
  readonly value: number
  readonly formula: E1rmFormula
  readonly reps: number
  /** False once the rep count leaves the range the formula was fitted for. */
  readonly isReliable: boolean
}

export function estimateOneRepMax(
  load: number,
  reps: number,
  formula: E1rmFormula = 'epley',
): E1rmEstimate {
  invariant(
    Number.isFinite(load) && load > 0,
    'E1RM_LOAD_INVALID',
    `Cannot estimate a one-rep max from a load of ${String(load)}.`,
  )
  invariant(
    Number.isInteger(reps) && reps > 0,
    'E1RM_REPS_INVALID',
    `Cannot estimate a one-rep max from ${String(reps)} reps.`,
  )

  // A single *is* the max. Every formula agrees, but only after rounding
  // noise, and Brzycki in particular returns 1.0000x rather than exactly x.
  const value = reps === 1 ? load : applyFormula(load, reps, formula)

  return {
    value: Number(value.toFixed(2)),
    formula,
    reps,
    isReliable: reps <= RELIABLE_REP_CEILING,
  }
}

function applyFormula(load: number, reps: number, formula: E1rmFormula): number {
  switch (formula) {
    case 'epley':
      return load * (1 + reps / 30)
    case 'brzycki':
      // Brzycki's denominator reaches zero at 37 reps and goes negative
      // beyond it, which would return a negative one-rep max. Clamping
      // keeps a nonsense input from producing a nonsense number that
      // looks like data.
      return load / Math.max(0.05, 1.0278 - 0.0278 * reps)
    case 'lombardi':
      return load * Math.pow(reps, 0.1)
  }
}

/**
 * The best estimate across a set of completed sets — the highest, since
 * one hard set tells you more than several easy ones.
 *
 * Warm-ups and skipped sets must be filtered out before this is called;
 * a 40% warm-up for five would otherwise compete with the working single.
 */
export function bestEstimate(
  sets: readonly { readonly load: number; readonly reps: number }[],
  formula: E1rmFormula = 'epley',
): E1rmEstimate | undefined {
  let best: E1rmEstimate | undefined

  for (const set of sets) {
    if (!Number.isFinite(set.load) || set.load <= 0) continue
    if (!Number.isInteger(set.reps) || set.reps <= 0) continue

    const estimate = estimateOneRepMax(set.load, set.reps, formula)
    if (best === undefined || estimate.value > best.value) best = estimate
  }

  return best
}

/* -------------------------------------------------------------------- */
/* Training max                                                          */
/* -------------------------------------------------------------------- */

/**
 * The training max: a deliberately conservative number that percentages
 * are taken from, so the prescribed work stays submaximal even on a bad
 * day.
 *
 * Wendler's original recommendation was 90% of a true max; his later
 * position is that most lifters do better at 85%, because the AMRAP sets
 * are where the progress comes from and they only work if there is
 * something left in the tank. Configurable for that reason.
 */
export function trainingMaxFrom(oneRepMax: number, percent: number): number {
  invariant(
    Number.isFinite(oneRepMax) && oneRepMax > 0,
    'TM_MAX_INVALID',
    `Cannot derive a training max from a one-rep max of ${String(oneRepMax)}.`,
  )
  invariant(
    Number.isFinite(percent) && percent > 0 && percent <= 100,
    'TM_PERCENT_INVALID',
    `A training max percentage must fall between 0 and 100, received ${String(percent)}.`,
  )
  return oneRepMax * (percent / 100)
}

/**
 * The reps an AMRAP set needs to beat for the current training max to
 * still be justified.
 *
 * Wendler's rule of thumb is that the top set of week 3 should be good
 * for at least the prescribed reps; falling short means the training max
 * has outrun the lifter. Expressed here so the progression rule that
 * resets a max has a number to compare against.
 */
export function amrapMeetsExpectation(achievedReps: number, prescribedMinimum: number): boolean {
  return achievedReps >= prescribedMinimum
}

/* -------------------------------------------------------------------- */
/* RPE                                                                   */
/* -------------------------------------------------------------------- */

/**
 * Percentage of a one-rep max for a given reps-at-RPE combination.
 *
 * The standard RPE chart, keyed by reps-in-reserve. It exists so an
 * RPE-prescribed accessory can still suggest a starting weight rather
 * than showing a blank box — LiftTracker prescribed everything by RPE and
 * offered no help at all with what to load, which pushed the lifter back
 * to remembering last week's number.
 *
 * Rows are reps; columns are RPE 10 down to RPE 6 in half-point steps.
 */
const RPE_CHART: Readonly<Record<number, readonly number[]>> = {
  1: [100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3],
  2: [95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85, 83.7],
  3: [92.2, 90.7, 89.2, 87.8, 86.3, 85, 83.7, 82.4, 81.1],
  4: [89.2, 87.8, 86.3, 85, 83.7, 82.4, 81.1, 79.9, 78.6],
  5: [86.3, 85, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2],
  6: [83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9],
  7: [81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7],
  8: [78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68],
  9: [76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68, 66.7, 65.3],
  10: [73.9, 72.3, 70.7, 69.4, 68, 66.7, 65.3, 64, 62.6],
  11: [70.7, 69.4, 68, 66.7, 65.3, 64, 62.6, 61.3, 60],
  12: [68, 66.7, 65.3, 64, 62.6, 61.3, 60, 58.7, 57.4],
}

export const RPE_CHART_MIN = 6
export const RPE_CHART_MAX = 10

/**
 * Returns the percentage of one-rep max, or undefined when the
 * combination falls outside the chart. Undefined is the honest answer —
 * interpolating past the edges produces numbers with no basis.
 */
export function percentOfMaxAtRpe(reps: number, rpe: number): number | undefined {
  const row = RPE_CHART[reps]
  if (row === undefined) return undefined
  if (rpe < RPE_CHART_MIN || rpe > RPE_CHART_MAX) return undefined

  // The chart steps in halves from RPE 10 downward.
  const index = Math.round((RPE_CHART_MAX - rpe) * 2)
  return row[index]
}

/** Suggests a load for an RPE-prescribed set, given a known max. */
export function loadForRpe(oneRepMax: number, reps: number, rpe: number): number | undefined {
  const percent = percentOfMaxAtRpe(reps, rpe)
  if (percent === undefined) return undefined
  return oneRepMax * (percent / 100)
}
