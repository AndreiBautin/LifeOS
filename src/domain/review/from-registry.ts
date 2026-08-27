import { SCORING } from '@/domain/game/registry'
import { asMetricId } from '@/domain/ids/ids'

import type { MetricDefinition } from './metric'

/**
 * Every rating the game model declares, as a metric this spine can judge.
 *
 * This function is the join that phase 4 exists to make. Before it, each
 * absorbed area would have had to score itself — five bespoke notions of
 * "is this going well", drifting apart, none of them comparable. After it,
 * an area declares a rating in `domain/game/registry.ts` and the
 * evaluators here do the judging, so adding a tracked area is a row.
 *
 * The registry stays the single declaration. Nothing is restated here: the
 * direction, the threshold, the cadence and the id all come across
 * unchanged, and `registry.test.ts` already guards that they are coherent.
 * A metric derived this way is **measured** — its `source` names what
 * produces the number, and the monthly entry form skips it, because nobody
 * should be typing in a backlog age the app can count.
 */
export function measuredMetrics(): readonly MetricDefinition[] {
  return SCORING.flatMap((area) =>
    area.ratings.map((rating, index): MetricDefinition => ({
      id: asMetricId(rating.id),
      area: area.area,
      name: rating.name,
      unit: rating.unit,
      direction: rating.direction,
      cadence: rating.cadence,
      ...(rating.threshold === undefined ? {} : { threshold: rating.threshold }),
      ...(rating.range === undefined ? {} : { range: rating.range }),
      source: rating.source,
      sortOrder: index,
      active: true,
    })),
  )
}

/**
 * The measured metrics plus whatever has been defined by hand.
 *
 * Both kinds live in one list because they are judged identically — the
 * only difference is where the number comes from. A net worth typed in at
 * the monthly review and a backlog age counted from the store are the same
 * kind of thing to every evaluator, every score and every screen below
 * this point, which is what stops the hub growing two parallel notions of
 * "a tracked number".
 *
 * A hand-defined metric wins a collision on id. Nothing should ever
 * produce one — the registry's ids are namespaced by area — but if
 * something did, the one somebody typed is the one they can see and edit.
 */
export function allMetrics(defined: readonly MetricDefinition[]): readonly MetricDefinition[] {
  const byId = new Map(measuredMetrics().map((metric) => [metric.id, metric]))
  for (const metric of defined) byId.set(metric.id, metric)

  return [...byId.values()]
    .filter((metric) => metric.active)
    .toSorted((a, b) => a.area.localeCompare(b.area) || a.sortOrder - b.sortOrder)
}
