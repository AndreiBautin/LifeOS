import { describe, expect, it } from 'vitest'

import { macroTargets, MAX_DAILY_ADJUSTMENT, type MacroInput } from './macros'
import type { WeightTrend } from './weight'

/**
 * The targets are derived from the scale, so the tests are mostly about
 * the places where deriving could invent something.
 *
 * Three of them matter: that the correction aims at the **nearest edge**
 * of the band rather than its middle, that a trend it cannot read
 * produces no correction rather than a zero one, and that the
 * arithmetic cannot turn a bad week into a dangerous instruction.
 */

const trendAt = (rate: number): WeightTrend => ({
  current: 180,
  previous: 180,
  ratePerWeek: rate,
  readings: 4,
})

const base: MacroInput = {
  bodyweight: 180,
  units: 'lb',
  phase: 'cut',
  intake: 2400,
  trend: trendAt(-0.75),
  verdict: 'on-track',
  range: { min: -1, max: -0.5 },
}

describe('protein and fat', () => {
  it('scales protein with bodyweight, in the lifter’s own units', () => {
    // 180 lb is 81.6 kg; a cut asks 2.2 g/kg.
    expect(macroTargets(base)?.protein).toBe(180)

    // The same lifter stated in kg must get the same answer.
    const inKg = macroTargets({ ...base, bodyweight: 81.65, units: 'kg' })
    expect(inKg?.protein).toBe(180)
  })

  it('asks for more protein on a cut than in a surplus', () => {
    // Where a deficit belongs: protein is what preserves lean mass when
    // energy is short. There is no comparable case in a surplus.
    const cut = macroTargets({ ...base, phase: 'cut' })?.protein ?? 0
    const bulk = macroTargets({ ...base, phase: 'bulk' })?.protein ?? 0

    expect(cut).toBeGreaterThan(bulk)
  })

  it('gives fat as a floor off bodyweight, not a share of calories', () => {
    // Same floor whatever the calorie figure — it is a physiological
    // minimum rather than a ratio somebody picked.
    expect(macroTargets({ ...base, intake: 1800 })?.fat).toBe(
      macroTargets({ ...base, intake: 3200 })?.fat,
    )
  })

  it('has nothing to say without a bodyweight', () => {
    expect(macroTargets({ ...base, bodyweight: 0 })).toBeUndefined()
    expect(macroTargets({ ...base, bodyweight: Number.NaN })).toBeUndefined()
  })
})

describe('the calorie correction', () => {
  it('leaves the intake alone when the trend is in the band', () => {
    const targets = macroTargets(base)

    expect(targets?.adjustment).toBe(0)
    expect(targets?.calories).toBe(2400)
  })

  /*
   * The load-bearing one. A band is a range of acceptable answers, so
   * the smallest change that lands inside it is the right advice.
   * Aiming for the centre would tell a lifter losing at 0.45%/wk to cut
   * roughly twice what the situation calls for.
   */
  it('aims at the nearest edge of the band, not its middle', () => {
    const nearlyThere = macroTargets({ ...base, trend: trendAt(-0.45), verdict: 'too-slow' })
    const wayOff = macroTargets({ ...base, trend: trendAt(-0.1), verdict: 'too-slow' })

    /*
     * The first is 0.05%/wk from the near edge and the second is 0.4% —
     * eight times the gap — and the corrections stand in that ratio.
     * Aiming at the middle of the band instead would put the first at
     * 0.3%/wk from target, six times what it actually needs.
     *
     * Asserted as a range rather than an exact figure on purpose: the
     * near case lands on 44.99 kcal, a hair under a rounding boundary,
     * and pinning it would make this test a hostage to the fourth
     * decimal place of a pounds-to-kilograms constant.
     */
    expect(Math.abs(nearlyThere?.adjustment ?? 0)).toBeLessThan(60)
    expect(Math.abs(wayOff?.adjustment ?? 0)).toBeGreaterThan(300)
  })

  it('tells a stalled cut to eat less and a runaway one to eat more', () => {
    const stalled = macroTargets({ ...base, trend: trendAt(-0.1), verdict: 'too-slow' })
    const runaway = macroTargets({ ...base, trend: trendAt(-1.6), verdict: 'too-fast' })

    expect(stalled?.adjustment).toBeLessThan(0)
    expect(runaway?.adjustment).toBeGreaterThan(0)
  })

  it('moves the stated total by exactly the correction', () => {
    const targets = macroTargets({ ...base, trend: trendAt(-0.1), verdict: 'too-slow' })

    expect(targets?.calories).toBe(2400 + (targets?.adjustment ?? 0))
  })

  /*
   * A measurement error must not become a dangerous instruction. One bad
   * reading in a window can produce an arithmetically correct correction
   * of well over a thousand calories a day, and if the true answer
   * really is that large, arriving there over two weeks is the right way
   * to do it.
   */
  it('will not suggest a change larger than the cap', () => {
    const absurd = macroTargets({ ...base, trend: trendAt(-9), verdict: 'too-fast' })

    expect(absurd?.adjustment).toBe(MAX_DAILY_ADJUSTMENT)
  })

  /*
   * Absent, never zero — and here the two read differently on screen.
   * Zero is "on track"; absent is "not enough readings".
   */
  it('offers no correction at all when there is no rate to read', () => {
    const noTrend = macroTargets({ ...base, verdict: 'unknown', trend: undefined })

    expect(noTrend?.adjustment).toBeUndefined()
    // The intake still stands as the total — it is what you said you eat.
    expect(noTrend?.calories).toBe(2400)
  })

  it('rounds to something the inputs can support', () => {
    // A smoothed average and a rule of thumb do not justify a target of
    // 2,373.
    const targets = macroTargets({ ...base, trend: trendAt(-0.31), verdict: 'too-slow' })

    // Through `Math.abs`, because `-170 % 10` is `-0` in JavaScript and
    // `toBe(0)` compares with `Object.is`.
    expect(Math.abs(targets?.calories ?? 0) % 10).toBe(0)
    expect(Math.abs(targets?.adjustment ?? 0) % 10).toBe(0)
  })
})

describe('carbohydrate, as the remainder', () => {
  it('is what is left after protein and the fat floor', () => {
    const targets = macroTargets(base)
    const fromMacros =
      (targets?.protein ?? 0) * 4 + (targets?.fat ?? 0) * 9 + (targets?.carbs ?? 0) * 4

    expect(fromMacros).toBeCloseTo(targets?.calories ?? 0, -1)
  })

  it('is absent rather than guessed when no intake has been stated', () => {
    const targets = macroTargets({ ...base, intake: undefined })

    expect(targets?.carbs).toBeUndefined()
    expect(targets?.calories).toBeUndefined()
    // Protein and fat still stand — bodyweight is all they need.
    expect(targets?.protein).toBe(180)
  })

  /*
   * Surfaced rather than resolved. A negative remainder is not "eat zero
   * carbs" — it is the calorie figure and the phase disagreeing, which
   * is a thing for a person to look at rather than for the model to
   * paper over.
   */
  it('says so rather than reporting negative carbs', () => {
    const impossible = macroTargets({ ...base, intake: 1000, verdict: 'unknown', trend: undefined })

    expect(impossible?.floorsExceedCalories).toBe(true)
    expect(impossible?.carbs).toBeUndefined()
  })
})
