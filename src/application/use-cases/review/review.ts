import type { RatingOutcome } from '@/domain/game/rating'
import type { MetricId } from '@/domain/ids/ids'
import type { Clock, ReviewRepository } from '@/domain/repositories/ports'
import { evaluate } from '@/domain/review/evaluate'
import { allMetrics } from '@/domain/review/from-registry'
import {
  seriesFor,
  toMonthKey,
  validateMetric,
  type MetricDefinition,
  type MonthlySnapshot,
} from '@/domain/review/metric'
import { blend, contributionOf, tierFor, type Tier } from '@/domain/review/score'

import { measureAll, type MeasureDeps } from './measure'

/**
 * The monthly review, and the readout that comes out of it.
 *
 * The shape the plan called the scoring spine: `area → metric → evaluator`,
 * all data rather than enums. Six areas produce ratings from real data and
 * not one of them scores itself — an area declares a rating in
 * `domain/game/registry.ts` and everything below this point judges it the
 * same way.
 *
 * Nothing here streaks, nags or congratulates. Dashboard was deliberately
 * a ten-minutes-a-month app and absorbing it into something opened daily
 * is exactly the circumstance in which that gets lost by degrees — so
 * cadence is a field on the rating and a monthly one renders its last
 * judgement rather than acquiring a streak because the page was opened.
 */

export interface ReviewDeps extends MeasureDeps {
  readonly review: ReviewRepository
  readonly clock: Clock
}

export interface MetricReading {
  readonly metric: MetricDefinition
  readonly outcome: RatingOutcome
  readonly latest?: number
  readonly previous?: number
  readonly tier?: Tier
  /** 0–100, or absent when there was nothing to score. */
  readonly score?: number
  readonly history: readonly { readonly month: string; readonly value: number }[]
}

export interface AreaReading {
  readonly area: string
  readonly metrics: readonly MetricReading[]
  /** The area's metrics blended, or absent when none of them scored. */
  readonly score?: number
}

export interface ReviewReadout {
  readonly areas: readonly AreaReading[]
  /** Every area blended, or absent when nothing scored anywhere. */
  readonly score?: number
  readonly month: string
}

/**
 * Every area's rating, from the months on record.
 *
 * Reads only what has been recorded. This month's live measurements do not
 * silently join the series — they land when the review is saved, which is
 * what keeps a *monthly* rating monthly rather than something that shifts
 * every time the page is opened.
 */
export async function readout(deps: ReviewDeps): Promise<ReviewReadout> {
  const [defined, snapshots] = await Promise.all([deps.review.metrics(), deps.review.snapshots()])

  const metrics = allMetrics(defined)
  const areas = [...new Set(metrics.map((metric) => metric.area))]

  const readings = metrics.map((metric): MetricReading => {
    const history = seriesFor(snapshots, metric.id)
    const values = history.map((point) => point.value)

    const outcome = evaluate(metric, values)
    const latest = values[values.length - 1]
    const previous = values[values.length - 2]
    const tier =
      metric.tiers === undefined || latest === undefined ? undefined : tierFor(latest, metric.tiers)

    const score = contributionOf(outcome, latest, metric.tiers)

    return {
      metric,
      outcome,
      ...(latest === undefined ? {} : { latest }),
      ...(previous === undefined ? {} : { previous }),
      ...(tier === undefined ? {} : { tier }),
      ...(score === undefined ? {} : { score }),
      history,
    }
  })

  const byArea = areas.map((area): AreaReading => {
    const inArea = readings.filter((reading) => reading.metric.area === area)
    const score = blend(inArea.map((reading) => reading.score))

    return { area, metrics: inArea, ...(score === undefined ? {} : { score }) }
  })

  /*
   * Areas are blended, not metrics. Averaging every metric directly would
   * let an area with nine tracked numbers outvote one with a single
   * important one — which is a statement about how much you happen to
   * measure, not about how your life is going.
   */
  const overall = blend(byArea.map((area) => area.score))

  return {
    areas: byArea,
    ...(overall === undefined ? {} : { score: overall }),
    month: toMonthKey(deps.clock.now()),
  }
}

/**
 * What this month's review will contain, before it is saved.
 *
 * Measured values are read from the hub's own data and cannot be edited;
 * entered ones open on whatever was recorded this month, if the review has
 * already been started. Both kinds come back together because the entry
 * screen shows one list — the difference is which fields it lets you type
 * in, not which list they are in.
 */
export interface ReviewDraft {
  readonly month: string
  readonly measured: Readonly<Record<string, number>>
  readonly entered: Readonly<Record<string, number>>
  readonly metrics: readonly MetricDefinition[]
  /** True once this month has been saved at least once. */
  readonly started: boolean
}

export async function draftReview(deps: ReviewDeps): Promise<ReviewDraft> {
  const month = toMonthKey(deps.clock.now())

  const [defined, existing, measured] = await Promise.all([
    deps.review.metrics(),
    deps.review.snapshot(month),
    measureAll(deps),
  ])

  const metrics = allMetrics(defined)

  /*
   * Only the entered values are carried forward from what was saved.
   * A measured value is re-read every time the draft is opened, because
   * the number the app can count is always more current than the copy of
   * it stored an hour ago.
   */
  const entered = Object.fromEntries(
    metrics
      .filter((metric) => metric.source === undefined)
      .flatMap((metric) => {
        const value = existing?.values[metric.id]
        return value === undefined ? [] : [[metric.id, value] as const]
      }),
  )

  return { month, measured, entered, metrics, started: existing !== undefined }
}

/**
 * Files this month's review.
 *
 * The month is the key, so re-filing corrects the record already there
 * rather than adding a second reading. Measured values are re-read at save
 * rather than taken from the caller — the screen showed them, it does not
 * get to decide them.
 */
export async function saveReview(
  entered: Readonly<Record<string, number>>,
  deps: ReviewDeps,
): Promise<MonthlySnapshot> {
  const month = toMonthKey(deps.clock.now())

  const [existing, measured, defined] = await Promise.all([
    deps.review.snapshot(month),
    measureAll(deps),
    deps.review.metrics(),
  ])

  /*
   * Measured values arrive keyed by *source* and are stored keyed by
   * *metric*, because a metric is what reads them back — `seriesFor` walks
   * the months looking for a metric's id, and a snapshot keyed the other
   * way is one every measured area reads as never recorded.
   *
   * The two are separate names on purpose. A source is what produces a
   * number and a metric is what judges it, and the same source could one
   * day feed two metrics judged differently.
   */
  const byMetric = Object.fromEntries(
    allMetrics(defined).flatMap((metric) => {
      if (metric.source === undefined) return []

      const value = measured[metric.source]
      return value === undefined ? [] : [[metric.id, value] as const]
    }),
  )

  const snapshot: MonthlySnapshot = {
    month,
    // Measured last, so nothing typed in can shadow a number the app
    // counted for itself.
    values: { ...existing?.values, ...entered, ...byMetric },
    createdAt: existing?.createdAt ?? deps.clock.now().toISOString(),
  }

  await deps.review.saveSnapshot(snapshot)
  return snapshot
}

export interface NewMetric {
  readonly metric: MetricDefinition
}

/**
 * Adds or edits a hand-defined metric, refusing an incomplete one.
 *
 * Checked here rather than when an evaluator meets it, so a missing
 * threshold fails where somebody can still fix it instead of confusingly,
 * months later, in the middle of a review.
 */
export async function saveMetric(
  metric: MetricDefinition,
  deps: ReviewDeps,
): Promise<{ readonly error?: string }> {
  const error = validateMetric(metric)
  if (error !== undefined) return { error }

  await deps.review.saveMetric(metric)
  return {}
}

/**
 * Retires a hand-defined metric rather than deleting it.
 *
 * Months of readings refer to it. Deleting the definition would leave
 * those values in the record with nothing to say what they measured — so
 * it is deactivated, drops out of `allMetrics`, and its history stays
 * readable.
 */
export async function retireMetric(id: MetricId, deps: ReviewDeps): Promise<void> {
  const existing = (await deps.review.metrics()).find((metric) => metric.id === id)
  if (existing === undefined) return

  await deps.review.saveMetric({ ...existing, active: false })
}
