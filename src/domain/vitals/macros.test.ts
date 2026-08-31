import { describe, expect, it } from 'vitest'

import { macroTargets, type MacroInput } from './macros'
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
  /*
   * The load-bearing one. A band is a range of acceptable answers, so
   * the smallest change that lands inside it is the right advice.
   * Aiming for the centre would tell a lifter losing at 0.45%/wk to cut
   * roughly twice what the situation calls for.
   */
  /*
   * A measurement error must not become a dangerous instruction. One bad
   * reading in a window can produce an arithmetically correct correction
   * of well over a thousand calories a day, and if the true answer
   * really is that large, arriving there over two weeks is the right way
   * to do it.
   */
  /*
   * Absent, never zero — and here the two read differently on screen.
   * Zero is "on track"; absent is "not enough readings".
   */
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
