import { describe, expect, it } from 'vitest'

import { PHASE_RATES, phaseVerdict, projectCorridor, weightTrend, type WeighIn } from './weight'

/**
 * The trend is two windows compared, and almost every way of getting
 * this wrong is a way of inventing a reading nobody took.
 *
 * "Absent, never zero" is the rule the whole review spine runs on, and
 * bodyweight is where it is easiest to break: carrying the last known
 * weight forward through a fortnight of not weighing in produces a rate
 * of exactly zero, which reads as a perfectly held maintenance phase and
 * is actually no evidence at all.
 */

const day = (day: string, weight: number): WeighIn => ({ day, weight })

// A fortnight ending on the 27th, so both windows are populated.
const now = new Date('2026-08-27T09:00:00.000Z')

describe('the weight trend', () => {
  it('has nothing to say with no readings', () => {
    expect(weightTrend([], now)).toBeUndefined()
  })

  it('reports a weight but no rate from a single week', () => {
    const trend = weightTrend([day('2026-08-25', 180), day('2026-08-26', 182)], now)

    expect(trend?.current).toBe(181)
    // One window is a weight. Two windows are a direction.
    expect(trend?.ratePerWeek).toBeUndefined()
  })

  it('averages the readings inside each window rather than taking the last', () => {
    const trend = weightTrend(
      [
        day('2026-08-16', 186),
        day('2026-08-18', 184),
        day('2026-08-24', 181),
        day('2026-08-26', 179),
      ],
      now,
    )

    expect(trend?.previous).toBe(185)
    expect(trend?.current).toBe(180)
  })

  it('states the rate as a percentage of bodyweight per week', () => {
    const trend = weightTrend([day('2026-08-18', 200), day('2026-08-26', 198)], now)

    // Two pounds off two hundred is one percent.
    expect(trend?.ratePerWeek).toBeCloseTo(-1, 5)
  })

  /*
   * The load-bearing one. A week with no readings contributes nothing
   * rather than repeating the last known weight — a carried-forward
   * value would show a flat scale for a fortnight of not weighing in.
   */
  it('does not carry a weight forward into a week with no readings', () => {
    const trend = weightTrend([day('2026-08-16', 185)], now)

    expect(trend).toBeUndefined()
  })

  it('ignores readings older than both windows', () => {
    const trend = weightTrend(
      [day('2026-01-01', 250), day('2026-08-18', 200), day('2026-08-26', 198)],
      now,
    )

    expect(trend?.previous).toBe(200)
  })

  it('counts how many readings the current figure rests on', () => {
    // Shown on screen, because an average of one is a weigh-in and an
    // average of five is a trend, and they should not look alike.
    expect(weightTrend([day('2026-08-24', 181), day('2026-08-26', 179)], now)?.readings).toBe(2)
  })
})

describe('judging a phase', () => {
  const trendAt = (rate: number) => ({
    current: 200,
    previous: 200,
    ratePerWeek: rate,
    readings: 3,
  })

  it('is unknown rather than on track when there is no rate', () => {
    // The distinction the whole spine rests on: no evidence is not a pass.
    expect(phaseVerdict(undefined, PHASE_RATES.cut)).toBe('unknown')
    expect(phaseVerdict({ current: 200, readings: 1 }, PHASE_RATES.cut)).toBe('unknown')
  })

  it('passes a cut losing at the target rate', () => {
    expect(phaseVerdict(trendAt(-0.75), PHASE_RATES.cut)).toBe('on-track')
  })

  /*
   * Fast and slow are separate answers because they call for opposite
   * corrections — and on a cut the fast one is what costs you muscle, so
   * collapsing them into "off target" would lose the half that matters.
   */
  it('separates losing too fast from losing too slowly', () => {
    expect(phaseVerdict(trendAt(-1.6), PHASE_RATES.cut)).toBe('too-fast')
    expect(phaseVerdict(trendAt(-0.1), PHASE_RATES.cut)).toBe('too-slow')
  })

  it('calls gaining on a cut too slow rather than on track', () => {
    expect(phaseVerdict(trendAt(0.4), PHASE_RATES.cut)).toBe('too-slow')
  })

  it('reads a bulk the same way in the other direction', () => {
    expect(phaseVerdict(trendAt(0.35), PHASE_RATES.bulk)).toBe('on-track')
    expect(phaseVerdict(trendAt(1.2), PHASE_RATES.bulk)).toBe('too-fast')
    expect(phaseVerdict(trendAt(0.05), PHASE_RATES.bulk)).toBe('too-slow')
  })

  /*
   * Maintenance is a band around zero, not a point. Movement in either
   * direction is "too fast" — there is no such thing as maintaining too
   * slowly — and a phase satisfied only by an exactly flat scale would
   * fail every month to day-to-day water.
   */
  it('treats movement either way as too fast on maintenance', () => {
    expect(phaseVerdict(trendAt(0), PHASE_RATES.maintain)).toBe('on-track')
    expect(phaseVerdict(trendAt(0.6), PHASE_RATES.maintain)).toBe('too-fast')
    expect(phaseVerdict(trendAt(-0.6), PHASE_RATES.maintain)).toBe('too-fast')
  })
})

describe('the target corridor', () => {
  it('opens from a single point as the weeks pass', () => {
    const corridor = projectCorridor(200, 28, PHASE_RATES.cut)

    // Day zero is the anchor itself: no time has passed, so there is no
    // spread yet and both edges sit on the starting weight.
    expect(corridor[0]?.low).toBeCloseTo(200, 5)
    expect(corridor[0]?.high).toBeCloseTo(200, 5)

    const last = corridor[corridor.length - 1]
    expect((last?.high ?? 0) - (last?.low ?? 0)).toBeGreaterThan(0)
  })

  it('descends on a cut and climbs on a bulk', () => {
    const cutting = projectCorridor(200, 14, PHASE_RATES.cut)
    const bulking = projectCorridor(200, 14, PHASE_RATES.bulk)

    expect(cutting[14]?.high ?? 0).toBeLessThan(200)
    expect(bulking[14]?.low ?? 0).toBeGreaterThan(200)
  })

  /*
   * Named by value rather than by which end of the band they came from.
   * On a cut both edges are negative and `min` is the lower weight; on a
   * bulk both are positive and `min` is the upper one, so a caller
   * assuming otherwise would draw one of the two phases inside out.
   */
  it('always reports low below high, whichever way the phase runs', () => {
    for (const phase of ['cut', 'maintain', 'bulk'] as const) {
      for (const point of projectCorridor(200, 21, PHASE_RATES[phase])) {
        expect(point.low).toBeLessThanOrEqual(point.high)
      }
    }
  })

  it('has nothing to draw without an anchor or a span', () => {
    expect(projectCorridor(0, 14, PHASE_RATES.cut)).toEqual([])
    expect(projectCorridor(200, 0, PHASE_RATES.cut)).toEqual([])
  })
})
