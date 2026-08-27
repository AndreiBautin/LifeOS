import type { RatingCadence, RatingDirection } from '@/domain/game/rating'
import type { MetricId } from '@/domain/ids/ids'

/**
 * A tracked number, and how to judge it.
 *
 * The piece that makes the hub extensible: adding something to track —
 * even something needing a rule an existing strategy already covers — is a
 * row rather than a release. That was true of the source and is the reason
 * it was worth absorbing rather than rewriting.
 *
 * Two kinds live in the same list, and the difference is where the value
 * comes from rather than how it is judged:
 *
 *   - **measured** — the value is read out of the hub's own data. Backlog
 *     age, project throughput, purchase progress, training consistency.
 *     The monthly entry form skips these; nobody types a number the app
 *     already knows.
 *   - **entered** — the value is typed in at the monthly review. Net
 *     worth, credit score, a waist measurement. Nothing here can know it.
 *
 * `source` is what ties a measured metric to the thing that produces it —
 * the same id `domain/game/registry.ts` gives that measurement, so a
 * rating declared there and a metric evaluated here cannot drift apart.
 */

export interface MetricDefinition {
  readonly id: MetricId
  /** The life area this belongs to. Data, never an enum. */
  readonly area: string
  readonly name: string
  readonly unit: string
  readonly direction: RatingDirection
  readonly cadence: RatingCadence
  /** For `stay-above` and `stay-below`. */
  readonly threshold?: number
  /** For `stay-within-range`. */
  readonly range?: { readonly min: number; readonly max: number }
  /**
   * Present when the hub measures this itself. Absent means it is typed in
   * at the monthly review.
   */
  readonly source?: string
  readonly sortOrder: number
  readonly active: boolean
  /**
   * Bands for a qualitative read on the *level*, where one makes sense.
   *
   * Orthogonal to the direction, and the distinction is worth holding on
   * to: direction says whether this moved, tiers say whether the number is
   * any good. A net worth that rose by a pound improved, and may still be
   * a thin number.
   */
  readonly tiers?: MetricTiers
  readonly updatedAt?: string
}

/**
 * Upper bounds for the first three tiers; anything past the third is the
 * fourth.
 *
 * `higherIsBetter` covers the common case and mirrors which end counts as
 * best, rather than asking metrics that run the other way — a waist
 * measurement — to invert their own thresholds. The three cutoffs always
 * mean the same thing and always ascend.
 */
export interface MetricTiers {
  readonly tier1Max: number
  readonly tier2Max: number
  readonly tier3Max: number
  readonly higherIsBetter: boolean
  readonly labels: readonly [string, string, string, string]
}

/**
 * Why a definition cannot be used, or `undefined` if it can.
 *
 * Checked when a definition is created rather than when an evaluator meets
 * it, so an incomplete configuration fails where somebody can still fix it
 * instead of confusingly, months later, in the middle of a monthly review.
 */
export function validateMetric(metric: MetricDefinition): string | undefined {
  if (metric.name.trim() === '') return 'A metric needs a name.'
  if (metric.unit.trim() === '') return 'A metric needs a unit.'

  if (
    (metric.direction === 'stay-above' || metric.direction === 'stay-below') &&
    metric.threshold === undefined
  ) {
    return `${metric.direction} needs a threshold.`
  }

  if (metric.direction === 'stay-within-range') {
    if (metric.range === undefined) return 'stay-within-range needs a minimum and a maximum.'
    if (metric.range.min >= metric.range.max) return 'The minimum must be below the maximum.'
  }

  if (metric.tiers !== undefined) {
    const { tier1Max, tier2Max, tier3Max } = metric.tiers
    if (!(tier1Max <= tier2Max && tier2Max <= tier3Max)) {
      return 'Tier cutoffs must ascend.'
    }
  }

  return undefined
}

/**
 * One month's review: every metric's value, recorded together.
 *
 * The month is the key, normalised to its first day. One review per month
 * is the invariant the whole record turns on — re-entering a value fixes
 * the one already there rather than adding a second, so a typo corrected
 * before moving on does not become two readings.
 */
export interface MonthlySnapshot {
  /** `YYYY-MM` — the month is the identity. */
  readonly month: string
  readonly values: Readonly<Record<string, number>>
  readonly createdAt: string
  readonly updatedAt?: string
}

/** The month a moment falls in, as `YYYY-MM`. */
export function toMonthKey(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${year}-${month}`
}

/** Months in order, oldest first — the order every evaluator assumes. */
export function inMonthOrder(snapshots: readonly MonthlySnapshot[]): readonly MonthlySnapshot[] {
  return snapshots.toSorted((a, b) => a.month.localeCompare(b.month))
}

/**
 * One metric's readings across every month that has one, oldest first.
 *
 * Months where the metric was not recorded are skipped rather than filled
 * with zero. A month you did not measure your waist is not a month your
 * waist was nothing, and an evaluator comparing against a fabricated zero
 * would report a catastrophe.
 */
export function seriesFor(
  snapshots: readonly MonthlySnapshot[],
  metricId: MetricId,
): readonly { readonly month: string; readonly value: number }[] {
  return inMonthOrder(snapshots).flatMap((snapshot) => {
    const value = snapshot.values[metricId]
    return value === undefined ? [] : [{ month: snapshot.month, value }]
  })
}
