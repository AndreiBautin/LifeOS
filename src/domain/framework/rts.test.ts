import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RTS,
  FATIGUE_TARGETS,
  accumulatedFatiguePercent,
  backoffStopRpe,
  estimatedMaxFromSet,
  evaluateFatigue,
  nextBackoffLoad,
  nextBackoffReps,
  plannedBackoffSets,
  suggestTopSetLoad,
  type PerformedSet,
  type RtsPrescription,
  validateRtsPrescription,
} from './rts'

const set = (load: number, reps: number, rpe: number): PerformedSet => ({ load, reps, rpe })

describe('estimating a max from an autoregulated set', () => {
  it('reads proximity to failure, not just reps', () => {
    // The whole reason RTS needs the RPE chart: five reps left in the tank
    // and five reps at failure are not the same evidence about strength.
    const easy = estimatedMaxFromSet(set(225, 5, 8))
    const hard = estimatedMaxFromSet(set(225, 5, 10))

    expect(easy).toBeDefined()
    expect(hard).toBeDefined()
    expect(easy ?? 0).toBeGreaterThan(hard ?? 0)
  })

  it('treats a maximal single as the max itself', () => {
    expect(estimatedMaxFromSet(set(315, 1, 10))).toBeCloseTo(315, 0)
  })

  it('still answers for rep counts outside the chart', () => {
    // Falls back to a rep-only formula rather than refusing. Less
    // accurate, but a 20-rep set should not make the app go blank.
    expect(estimatedMaxFromSet(set(135, 20, 9))).toBeGreaterThan(135)
  })
})

describe('fatigue as a drop in estimated max', () => {
  it('is zero at the top set', () => {
    const top = set(315, 3, 8)
    expect(accumulatedFatiguePercent(top, top)).toBe(0)
  })

  it('grows as RPE climbs on repeats at the same weight', () => {
    // Tuchscherer's worked repeats example: 425×3 at RPE 8, 8, 8.5, 9.
    const top = set(425, 3, 8)

    const afterHalf = accumulatedFatiguePercent(top, set(425, 3, 8.5)) ?? 0
    const afterFull = accumulatedFatiguePercent(top, set(425, 3, 9)) ?? 0

    expect(afterHalf).toBeGreaterThan(0)
    expect(afterFull).toBeGreaterThan(afterHalf)
    // 3 reps at RPE 8 is 86.3% of max and at RPE 9 is 89.2%, so the same
    // bar weight implies about a 3.2% loss.
    expect(afterFull).toBeCloseTo(3.25, 1)
  })

  it('clamps a negative drop to zero rather than reporting recovery', () => {
    // Getting "stronger" across sets means the top set was underrated,
    // not that fatigue reversed.
    const top = set(225, 5, 9)
    expect(accumulatedFatiguePercent(top, set(225, 5, 7))).toBe(0)
  })
})

describe('deciding when to stop adding sets', () => {
  const prescription: RtsPrescription = {
    ...DEFAULT_RTS,
    method: 'repeats',
    fatigueTargetPercent: FATIGUE_TARGETS.moderate,
  }
  const top = set(425, 3, 8)

  it('keeps going while fatigue is below target', () => {
    const state = evaluateFatigue(prescription, top, [set(425, 3, 8)])

    expect(state.shouldStop).toBe(false)
    expect(state.accumulatedPercent).toBeLessThan(5)
  })

  it('stops once the target is reached', () => {
    // Three reps climbing RPE 8 → 9 at the same load is about a 3.2% drop
    // in estimated max, not 5%. Tuchscherer's published example labels
    // that sequence "5%", but the arithmetic of his own chart does not
    // agree, and the chart is what this implements — so the target is set
    // where the numbers actually land.
    const state = evaluateFatigue({ ...prescription, fatigueTargetPercent: 3 }, top, [
      set(425, 3, 8),
      set(425, 3, 8.5),
      set(425, 3, 9),
    ])

    expect(state.accumulatedPercent).toBeCloseTo(3.25, 1)
    expect(state.shouldStop).toBe(true)
    expect(state.reason).toMatch(/that is the target/)
  })

  it('reproduces the load-drop example exactly', () => {
    /*
     * The unambiguous case from the published guidance: work up to
     * 100 × 5 @9, drop the bar 5%, and keep going until the *lighter*
     * weight feels like the original RPE. At that point performance has
     * fallen by exactly the load drop — because at matched reps and RPE,
     * estimated max is proportional to bar weight.
     */
    const opener = set(100, 5, 9)
    const state = evaluateFatigue(
      { ...DEFAULT_RTS, method: 'load-drop', fatigueTargetPercent: 5, loadDropPercent: 5 },
      opener,
      [set(95, 5, 8), set(95, 5, 8.5), set(95, 5, 9)],
    )

    expect(state.accumulatedPercent).toBeCloseTo(5, 1)
    expect(state.shouldStop).toBe(true)
  })

  it('stops at the cap when the top set was underrated', () => {
    // Fatigue never arrives because the opening set was called too light.
    // The session has to end anyway, and the reason should say why.
    const flat = Array.from({ length: 6 }, () => set(425, 3, 8))
    const state = evaluateFatigue({ ...prescription, maxBackoffSets: 6 }, top, flat)

    expect(state.shouldStop).toBe(true)
    expect(state.reason).toMatch(/underrated/)
  })

  it('treats a zero target as a top-set-only prescription', () => {
    const state = evaluateFatigue({ ...prescription, fatigueTargetPercent: 0 }, top, [])

    expect(state.shouldStop).toBe(true)
    expect(state.reason).toMatch(/the top set is the work/i)
  })
})

describe('what to load for the next back-off set', () => {
  const top = set(300, 5, 8)

  it('drops the bar for a load-drop protocol', () => {
    const load = nextBackoffLoad({ ...DEFAULT_RTS, method: 'load-drop', loadDropPercent: 5 }, top)
    expect(load).toBe(285)
  })

  it('holds the bar for repeats and rep-drops', () => {
    expect(nextBackoffLoad({ ...DEFAULT_RTS, method: 'repeats' }, top)).toBe(300)
    expect(nextBackoffLoad({ ...DEFAULT_RTS, method: 'rep-drop' }, top)).toBe(300)
  })

  it('holds the reps for a load drop and sheds them for a rep drop', () => {
    expect(nextBackoffReps({ ...DEFAULT_RTS, method: 'load-drop' }, top, [])).toBe(
      DEFAULT_RTS.topSetReps,
    )

    const dropping = { ...DEFAULT_RTS, method: 'rep-drop' as const }
    expect(nextBackoffReps(dropping, top, [])).toBe(4)
    expect(nextBackoffReps(dropping, top, [set(300, 4, 8)])).toBe(3)
  })
})

describe('suggesting an opening load', () => {
  it('reads the estimate through the RPE chart', () => {
    // 5 reps at RPE 8 is 81.1% of max, so a 400 lb estimate suggests ~324.
    expect(suggestTopSetLoad(400, 5, 8)).toBeCloseTo(324.4, 0)
  })

  it('declines rather than guessing when there is no estimate yet', () => {
    expect(suggestTopSetLoad(undefined, 5, 8)).toBeUndefined()
  })

  it('declines for a rep count the chart does not cover', () => {
    expect(suggestTopSetLoad(400, 30, 8)).toBeUndefined()
  })
})

describe('validation', () => {
  it('accepts the default prescription', () => {
    expect(() => {
      validateRtsPrescription(DEFAULT_RTS)
    }).not.toThrow()
  })

  it('rejects an RPE outside the usable scale', () => {
    expect(() => {
      validateRtsPrescription({ ...DEFAULT_RTS, topSetRpe: 11 })
    }).toThrow(/between 6 and 10/)
  })

  it('rejects a fatigue target well past published guidance', () => {
    expect(() => {
      validateRtsPrescription({ ...DEFAULT_RTS, fatigueTargetPercent: 40 })
    }).toThrow(/outside the useful range/)
  })
})

/*
 * The stopping rule, restated in a unit a lifter can act on.
 *
 * "Stop when a set implies a max 5.3% below the top set" is correct and
 * unusable between sets. The RPE form is the same rule — the top set's
 * weight cancels out of the comparison — so it can be worked out when
 * the block is assembled rather than in the gym.
 */
describe('the RPE a back-off block stops at', () => {
  it('sits above the top-set RPE, because that is what fatigue looks like', () => {
    const stop = backoffStopRpe(5, 8, 5, 5.3)

    expect(stop).toBeGreaterThan(8)
    expect(stop).toBe(8.5)
  })

  it('runs further on a lift with a larger fatigue allowance', () => {
    // A specialised lift is allowed to fall further before it stops, so
    // it takes more back-offs to get there.
    const building = backoffStopRpe(5, 8, 5, 5) ?? 0
    const specialising = backoffStopRpe(5, 8, 5, 7) ?? 0

    expect(specialising).toBeGreaterThan(building)
  })

  /*
   * A heavier back-off has to be *ground out further* before it has
   * spent the allowance, because the drop itself is not fatigue. Fewer
   * sets to get there, but a higher reading on the one that ends it —
   * which is why the load drop belongs inside the threshold rather than
   * being counted against the lifter.
   */
  it('asks for a higher reading when the back-off is heavier', () => {
    const bigDrop = backoffStopRpe(5, 8, 10, 5.3) ?? 0
    const smallDrop = backoffStopRpe(5, 8, 2, 5.3) ?? 0

    expect(smallDrop).toBeGreaterThan(bigDrop)
  })

  it('caps at the top of the chart rather than promising an impossible set', () => {
    // A tiny drop against a large allowance: no RPE reaches the target,
    // so the set cap is what ends the block.
    expect(backoffStopRpe(5, 8, 0, 40)).toBe(10)
  })

  it('has no answer for reps the chart does not cover', () => {
    expect(backoffStopRpe(30, 8, 5, 5)).toBeUndefined()
  })
})

/*
 * Reported from real use: the back-offs always read the same however the
 * fatigue setting was moved. They did — the count was a flat cap of
 * three for every non-zero target, so Minimal and High built identical
 * sessions and the setting decided only when to stop.
 */
describe('how many back-off sets to plan', () => {
  it('plans none when the target is none', () => {
    expect(plannedBackoffSets(FATIGUE_TARGETS.none)).toBe(0)
  })

  it('plans more for a bigger target, which is the whole point', () => {
    const minimal = plannedBackoffSets(FATIGUE_TARGETS.minimal)
    const moderate = plannedBackoffSets(FATIGUE_TARGETS.moderate)
    const high = plannedBackoffSets(FATIGUE_TARGETS.high)

    expect(minimal).toBeLessThan(moderate)
    expect(moderate).toBeLessThan(high)
  })

  it('reads as one, three and four across the published scale', () => {
    expect(plannedBackoffSets(FATIGUE_TARGETS.minimal)).toBe(1)
    expect(plannedBackoffSets(FATIGUE_TARGETS.moderate)).toBe(3)
    expect(plannedBackoffSets(FATIGUE_TARGETS.high)).toBe(4)
  })

  /*
   * Any non-zero target needs at least one set to measure a drop
   * against. Rounding a small target to zero would silently turn it into
   * "top set only", which is a different choice the lifter did not make.
   */
  it('never plans zero for a target somebody asked for', () => {
    expect(plannedBackoffSets(0.5)).toBe(1)
    expect(plannedBackoffSets(1)).toBe(1)
  })

  it('grows without a ceiling of its own, leaving that to maxBackoffSets', () => {
    expect(plannedBackoffSets(20)).toBeGreaterThan(plannedBackoffSets(10))
  })
})
