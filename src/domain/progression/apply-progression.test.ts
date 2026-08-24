import { describe, expect, it } from 'vitest'

import type { ProgressionRule } from '@/domain/programs/progression-rule'
import { anAmrapSet, anEntry, aSet, aWorkout, BENCH, SQUAT } from '@/test/builders/workout'

import { applyProgression, applyTrainingMaxChanges } from './apply-progression'

const raiseUpper: ProgressionRule = {
  kind: 'adjust-training-max',
  exercises: [BENCH],
  delta: { kind: 'absolute', amount: 5 },
  condition: { kind: 'amrap-at-least', reps: 1, selector: { kind: 'role', role: 'main' } },
  label: 'Bench training max +5 each cycle',
}

const raiseLower: ProgressionRule = {
  kind: 'adjust-training-max',
  exercises: [SQUAT],
  delta: { kind: 'absolute', amount: 10 },
  condition: { kind: 'amrap-at-least', reps: 1, selector: { kind: 'role', role: 'main' } },
  label: 'Squat training max +10 each cycle',
}

const resetOnMiss: ProgressionRule = {
  kind: 'reset-training-max',
  exercises: 'all',
  toPercent: 90,
  condition: { kind: 'amrap-below', reps: 1, selector: { kind: 'role', role: 'main' } },
  label: 'Cut the training max to 90% after a missed AMRAP',
}

const trainingMaxes = { [SQUAT]: 315, [BENCH]: 225 }

const input = {
  trainingMaxes,
  roundingIncrement: 5,
}

describe('a cycle where every AMRAP set was met', () => {
  const cycleLogs = [
    aWorkout({ entries: [anEntry({ exerciseId: SQUAT, sets: [anAmrapSet(1, 6)] })] }),
    aWorkout({ entries: [anEntry({ exerciseId: BENCH, sets: [anAmrapSet(1, 4)] })] }),
  ]

  it('raises the lower-body max by ten and the upper by five', () => {
    const outcome = applyProgression({ ...input, rules: [raiseUpper, raiseLower], cycleLogs })

    expect(outcome.trainingMaxChanges).toEqual([
      { exerciseId: BENCH, from: 225, to: 230, reason: 'Bench training max +5 each cycle' },
      { exerciseId: SQUAT, from: 315, to: 325, reason: 'Squat training max +10 each cycle' },
    ])
  })

  it('does not fire the reset rule', () => {
    const outcome = applyProgression({
      ...input,
      rules: [raiseUpper, raiseLower, resetOnMiss],
      cycleLogs,
    })

    expect(outcome.trainingMaxChanges.map((change) => change.to)).toEqual([230, 325])
    expect(outcome.skipped.map((entry) => entry.ruleLabel)).toEqual([
      'Cut the training max to 90% after a missed AMRAP',
    ])
  })

  it('explains why a rule did not fire, rather than staying silent', () => {
    const outcome = applyProgression({ ...input, rules: [resetOnMiss], cycleLogs })

    expect(outcome.skipped[0]?.reason).toBe('Every AMRAP set met its minimum.')
  })
})

describe('a cycle where an AMRAP set was missed', () => {
  // A 95% single that could not be completed for the prescribed rep means
  // the training max has outrun the lifter. Wendler's response is a cut,
  // not a hold — and neither old app could express a conditional
  // progression at all, so this whole behaviour is new.
  const cycleLogs = [
    aWorkout({
      entries: [anEntry({ exerciseId: SQUAT, sets: [anAmrapSet(3, 1)] })],
    }),
  ]

  it('cuts the training max to 90%', () => {
    const outcome = applyProgression({ ...input, rules: [resetOnMiss], cycleLogs })

    // 315 × 0.9 = 283.5, rounded to 285.
    expect(outcome.trainingMaxChanges).toContainEqual({
      exerciseId: SQUAT,
      from: 315,
      to: 285,
      reason: 'Cut the training max to 90% after a missed AMRAP',
    })
  })

  it('prefers the cut when a raise and a reset both fire on the same lift', () => {
    // Only reachable from a hand-edited rule set, since the two conditions
    // are mutually exclusive — but a raise and a cut both applying would
    // leave the lifter with whichever ran last, which is the wrong way to
    // resolve it.
    const alwaysRaise: ProgressionRule = {
      ...raiseLower,
      condition: { kind: 'always' },
    }

    const outcome = applyProgression({
      ...input,
      rules: [alwaysRaise, resetOnMiss],
      cycleLogs,
    })

    const squat = outcome.trainingMaxChanges.filter((change) => change.exerciseId === SQUAT)
    expect(squat).toHaveLength(1)
    expect(squat[0]?.to).toBe(285)
  })
})

describe('a cycle with no AMRAP set logged', () => {
  const cycleLogs = [aWorkout({ entries: [anEntry({ sets: [aSet()] })] })]

  it('neither raises nor cuts', () => {
    const outcome = applyProgression({
      ...input,
      rules: [raiseUpper, raiseLower, resetOnMiss],
      cycleLogs,
    })

    expect(outcome.trainingMaxChanges).toEqual([])
    expect(outcome.skipped).toHaveLength(3)
    expect(outcome.skipped.every((entry) => entry.reason.includes('No AMRAP set'))).toBe(true)
  })
})

describe('supplemental percentage progression', () => {
  it('reports the climb without touching a training max', () => {
    const rule: ProgressionRule = {
      kind: 'adjust-load-percent',
      selector: { kind: 'role', role: 'supplemental' },
      deltaPercent: 2.5,
      maxPercent: 60,
      condition: { kind: 'always' },
      label: 'Boring But Big climbs 50% → 60%',
    }

    const outcome = applyProgression({ ...input, rules: [rule], cycleLogs: [] })

    expect(outcome.trainingMaxChanges).toEqual([])
    expect(outcome.percentChanges).toEqual([
      {
        ruleLabel: 'Boring But Big climbs 50% → 60%',
        selector: { kind: 'role', role: 'supplemental' },
        deltaPercent: 2.5,
        maxPercent: 60,
        reason: 'Boring But Big climbs 50% → 60%',
      },
    ])
  })
})

describe('rounding', () => {
  it('never proposes a training max the bar cannot be loaded to', () => {
    const percentRaise: ProgressionRule = {
      kind: 'adjust-training-max',
      exercises: [SQUAT],
      delta: { kind: 'percent', amount: 2 },
      condition: { kind: 'always' },
      label: 'Squat training max +2%',
    }

    // 315 × 1.02 = 321.3, which rounds to 320 rather than being shown as
    // a number no plate combination produces.
    const outcome = applyProgression({ ...input, rules: [percentRaise], cycleLogs: [] })

    expect(outcome.trainingMaxChanges[0]?.to).toBe(320)
  })

  it('omits a change that rounds back to where it started', () => {
    const tinyRaise: ProgressionRule = {
      kind: 'adjust-training-max',
      exercises: [SQUAT],
      delta: { kind: 'absolute', amount: 1 },
      condition: { kind: 'always' },
      label: 'Squat training max +1',
    }

    // 316 rounds to 315. Reporting "315 → 315" as a change would be noise.
    const outcome = applyProgression({ ...input, rules: [tinyRaise], cycleLogs: [] })

    expect(outcome.trainingMaxChanges).toEqual([])
  })
})

describe('applying accepted changes', () => {
  it('folds them into the training-max map', () => {
    const next = applyTrainingMaxChanges(trainingMaxes, [
      { exerciseId: SQUAT, from: 315, to: 325, reason: 'raise' },
    ])

    expect(next).toEqual({ [SQUAT]: 325, [BENCH]: 225 })
  })

  it('returns the original map untouched when nothing was accepted', () => {
    expect(applyTrainingMaxChanges(trainingMaxes, [])).toBe(trainingMaxes)
  })

  it('does not mutate the map it was given', () => {
    const original = { ...trainingMaxes }
    applyTrainingMaxChanges(original, [{ exerciseId: SQUAT, from: 315, to: 325, reason: 'raise' }])

    expect(original[SQUAT]).toBe(315)
  })
})

describe('the all-sets-completed condition', () => {
  it('does not fire when a set was skipped', () => {
    const rule: ProgressionRule = {
      kind: 'adjust-sets',
      selector: { kind: 'all' },
      delta: 1,
      condition: { kind: 'all-sets-completed', selector: { kind: 'all' } },
      label: 'Add a set after a clean cycle',
    }

    const withSkip = [
      aWorkout({ entries: [anEntry({ sets: [aSet(), aSet({ outcome: 'skipped' })] })] }),
    ]

    expect(applyProgression({ ...input, rules: [rule], cycleLogs: withSkip }).setChanges).toEqual(
      [],
    )
    expect(
      applyProgression({ ...input, rules: [rule], cycleLogs: [aWorkout()] }).setChanges,
    ).toEqual([{ ruleLabel: 'Add a set after a clean cycle', delta: 1 }])
  })
})
