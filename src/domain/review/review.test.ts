import { describe, expect, it } from 'vitest'

import { RATING_DIRECTIONS, type RatingDirection } from '@/domain/game/rating'
import { asMetricId, type MetricId } from '@/domain/ids/ids'

import { evaluate } from './evaluate'
import {
  seriesFor,
  toMonthKey,
  validateMetric,
  type MetricDefinition,
  type MetricTiers,
  type MonthlySnapshot,
} from './metric'
import { blend, contributionOf, scoreForOutcome, scoreForValue, tierFor } from './score'

/**
 * The scoring spine, ported from Dashboard's five evaluators and its
 * rating calculator.
 *
 * What is worth testing here is what the other five areas now depend on:
 * every one of them gets its rating from these functions, so a rule that
 * is wrong here is wrong everywhere at once — which is the whole point of
 * having one spine rather than five bespoke scorers.
 */

function aMetric(overrides: Partial<MetricDefinition> = {}): MetricDefinition {
  return {
    id: asMetricId('metric'),
    area: 'finance',
    name: 'Net worth',
    unit: 'currency',
    direction: 'increase',
    cadence: 'monthly',
    sortOrder: 1,
    active: true,
    ...overrides,
  }
}

describe('evaluate', () => {
  it('says nothing at all with fewer than two readings', () => {
    expect(evaluate(aMetric(), [])).toBe('insufficient-data')
    expect(evaluate(aMetric(), [42])).toBe('insufficient-data')
  })

  it.each<[RatingDirection, number[], string]>([
    ['increase', [10, 20], 'improved'],
    ['increase', [20, 10], 'regressed'],
    ['increase', [10, 10], 'stagnant'],
    ['decrease', [20, 10], 'improved'],
    ['decrease', [10, 20], 'regressed'],
    ['decrease', [10, 10], 'stagnant'],
  ])('%s from %j is %s', (direction, values, expected) => {
    expect(evaluate(aMetric({ direction }), values)).toBe(expected)
  })

  /*
   * A threshold metric is judged on which side of the line it sits, not on
   * which way it moved. That is the whole reason it is a separate
   * direction rather than `increase` with a note attached.
   */
  describe('stay-above', () => {
    const metric = aMetric({ direction: 'stay-above', threshold: 700 })

    it('regresses below the line however it got there', () => {
      expect(evaluate(metric, [750, 690])).toBe('regressed')
      expect(evaluate(metric, [650, 690])).toBe('regressed')
    })

    it('improves on the crossing back over', () => {
      expect(evaluate(metric, [650, 710])).toBe('improved')
    })

    it('is stagnant while it stays above, even after a fall', () => {
      // Twenty points down and still comfortably clear. Nothing has gone
      // wrong, and reporting a regression would be the app inventing one.
      expect(evaluate(metric, [790, 770])).toBe('stagnant')
    })
  })

  describe('stay-below', () => {
    const metric = aMetric({ direction: 'stay-below', threshold: 100 })

    it('regresses above the line', () => {
      expect(evaluate(metric, [90, 110])).toBe('regressed')
    })

    it('improves on the crossing back under', () => {
      expect(evaluate(metric, [110, 90])).toBe('improved')
    })

    it('is stagnant while it stays under', () => {
      expect(evaluate(metric, [50, 80])).toBe('stagnant')
    })
  })

  describe('stay-within-range', () => {
    const metric = aMetric({ direction: 'stay-within-range', range: { min: 60, max: 80 } })

    it('regresses outside the band, either end', () => {
      expect(evaluate(metric, [70, 90])).toBe('regressed')
      expect(evaluate(metric, [70, 50])).toBe('regressed')
    })

    it('improves on the way back in', () => {
      expect(evaluate(metric, [90, 70])).toBe('improved')
    })

    it('is stagnant while it stays in', () => {
      expect(evaluate(metric, [65, 75])).toBe('stagnant')
    })
  })

  /*
   * The switch is exhaustive, so a sixth direction fails the build here
   * rather than falling through to a default. That is what a union buys
   * over the factory this replaced — registering an evaluator is something
   * you can forget; handling a case is not.
   */
  it('handles every direction the rating vocabulary defines', () => {
    for (const direction of RATING_DIRECTIONS) {
      const metric = aMetric({
        direction,
        threshold: 10,
        range: { min: 5, max: 15 },
      })

      expect(() => evaluate(metric, [10, 12])).not.toThrow()
    }
  })
})

describe('validateMetric', () => {
  it('requires a threshold where a threshold is the rule', () => {
    expect(validateMetric(aMetric({ direction: 'stay-above' }))).toMatch(/threshold/)
    expect(validateMetric(aMetric({ direction: 'stay-below', threshold: 3 }))).toBeUndefined()
  })

  it('requires a band that is the right way round', () => {
    expect(validateMetric(aMetric({ direction: 'stay-within-range' }))).toMatch(/minimum/)
    expect(
      validateMetric(aMetric({ direction: 'stay-within-range', range: { min: 9, max: 4 } })),
    ).toMatch(/below the maximum/)
  })

  it('requires tier cutoffs to ascend', () => {
    const tiers: MetricTiers = {
      tier1Max: 30,
      tier2Max: 10,
      tier3Max: 50,
      higherIsBetter: true,
      labels: ['a', 'b', 'c', 'd'],
    }

    expect(validateMetric(aMetric({ tiers }))).toMatch(/ascend/)
  })
})

describe('scoring an outcome', () => {
  /*
   * Nothing, never zero. A metric measured once is not a metric scoring
   * badly, and averaging in a zero turns an honest blank into an
   * accusation.
   */
  it('has nothing to say without enough data', () => {
    expect(scoreForOutcome('insufficient-data')).toBeUndefined()
  })

  it('ranks improved above stagnant above regressed', () => {
    const improved = scoreForOutcome('improved') ?? 0
    const stagnant = scoreForOutcome('stagnant') ?? 0
    const regressed = scoreForOutcome('regressed') ?? 0

    expect(improved).toBeGreaterThan(stagnant)
    expect(stagnant).toBeGreaterThan(regressed)
  })
})

describe('tiers', () => {
  const tiers: MetricTiers = {
    tier1Max: 10_000,
    tier2Max: 100_000,
    tier3Max: 500_000,
    higherIsBetter: true,
    labels: ['Thin', 'Solid', 'Strong', 'Excellent'],
  }

  it('places a value in its band', () => {
    expect(tierFor(5_000, tiers)).toBe('tier1')
    expect(tierFor(50_000, tiers)).toBe('tier2')
    expect(tierFor(300_000, tiers)).toBe('tier3')
    expect(tierFor(900_000, tiers)).toBe('tier4')
  })

  /*
   * A waist measurement runs the other way. Rather than asking it to
   * invert its own thresholds — which would make the three cutoffs mean
   * different things on different metrics — the cutoffs always ascend and
   * the flag mirrors which end is best.
   */
  it('mirrors the scale for a metric where smaller is better', () => {
    const waist: MetricTiers = { ...tiers, higherIsBetter: false }

    expect(tierFor(5_000, waist)).toBe('tier4')
    expect(tierFor(900_000, waist)).toBe('tier1')
  })

  it('interpolates within a band rather than flattening it', () => {
    // Both land in tier two; one is nearly through it.
    const early = scoreForValue(11_000, tiers)
    const late = scoreForValue(99_000, tiers)

    expect(early).toBeGreaterThan(25)
    expect(late).toBeLessThan(50)
    expect(late).toBeGreaterThan(early)
  })

  /*
   * The top band is a difference in kind, not a fourth slice. Past every
   * cutoff there is nothing left to measure progress against.
   */
  it('is a flat hundred past the last cutoff', () => {
    expect(scoreForValue(600_000, tiers)).toBe(100)
    expect(scoreForValue(50_000_000, tiers)).toBe(100)
  })

  it('handles a band with no width rather than dividing by zero', () => {
    const flat: MetricTiers = { ...tiers, tier1Max: 100, tier2Max: 100 }

    expect(Number.isFinite(scoreForValue(100, flat))).toBe(true)
  })
})

describe('contributionOf', () => {
  const tiers: MetricTiers = {
    tier1Max: 10,
    tier2Max: 20,
    tier3Max: 30,
    higherIsBetter: true,
    labels: ['a', 'b', 'c', 'd'],
  }

  it('prefers the trend when there is one', () => {
    expect(contributionOf('improved', 5, tiers)).toBe(scoreForOutcome('improved'))
  })

  /*
   * The fallback earns its place: a metric recorded once has no trend and
   * would otherwise sit blank for a month while its actual value was
   * perfectly informative.
   */
  it('falls back to the level when there is no trend yet', () => {
    expect(contributionOf('insufficient-data', 35, tiers)).toBe(100)
  })

  it('has nothing to contribute with neither trend nor bands', () => {
    expect(contributionOf('insufficient-data', 35, undefined)).toBeUndefined()
    expect(contributionOf('insufficient-data', undefined, tiers)).toBeUndefined()
  })
})

describe('blend', () => {
  it('ignores what had nothing to say rather than counting it as zero', () => {
    expect(blend([100, undefined, 50])).toBe(75)
  })

  it('is nothing at all when nothing was scoreable', () => {
    expect(blend([undefined, undefined])).toBeUndefined()
    expect(blend([])).toBeUndefined()
  })
})

describe('reading a series out of the months', () => {
  const snapshot = (month: string, values: Record<string, number>): MonthlySnapshot => ({
    month,
    values,
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  const metricId = 'weight' as MetricId

  it('puts the months in order whatever order they arrived in', () => {
    const series = seriesFor(
      [snapshot('2026-03', { weight: 3 }), snapshot('2026-01', { weight: 1 })],
      metricId,
    )

    expect(series.map((point) => point.month)).toEqual(['2026-01', '2026-03'])
  })

  /*
   * A month you did not measure is skipped, not filled with zero. A month
   * without a waist measurement is not a month your waist was nothing, and
   * an evaluator handed that would report a catastrophe.
   */
  it('skips a month the metric was not recorded in', () => {
    const series = seriesFor(
      [
        snapshot('2026-01', { weight: 80 }),
        snapshot('2026-02', {}),
        snapshot('2026-03', { weight: 79 }),
      ],
      metricId,
    )

    expect(series.map((point) => point.value)).toEqual([80, 79])
    expect(evaluate(aMetric({ direction: 'decrease' }), [80, 79])).toBe('improved')
  })
})

describe('toMonthKey', () => {
  it('names the month a moment falls in', () => {
    expect(toMonthKey(new Date(2026, 7, 26))).toBe('2026-08')
  })
})
