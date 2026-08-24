import { describe, expect, it } from 'vitest'

import {
  CANONICAL_531_WEEKS,
  DEFAULT_BBB,
  mainSetPrescriptions,
  supplementalPrescriptions,
} from '@/domain/framework/five-three-one'
import { asExerciseId } from '@/domain/ids/ids'
import type { SetPrescription } from '@/domain/programs/prescription'

import { missingRequirements, resolveSet, resolveSets, type AthleteState } from './resolve'

const SQUAT = asExerciseId('squat')
const CURL = asExerciseId('curl')

/** A 350 lb squat at the default 90% training max. */
const athlete: AthleteState = {
  trainingMaxes: { [SQUAT]: 315 },
  estimatedMaxes: { [CURL]: 100 },
  bodyweight: 180,
  units: 'lb',
}

const context = { athlete, exerciseId: SQUAT, roundingIncrement: 5 }

describe('resolving a full 5/3/1 cycle against a 315 lb training max', () => {
  const loadsForWeek = (weekIndex: number): (number | undefined)[] => {
    const week = CANONICAL_531_WEEKS[weekIndex]
    if (!week) throw new Error(`missing week ${String(weekIndex)}`)
    return resolveSets(mainSetPrescriptions(week, { includeWarmups: false }), context).map(
      (set) => set.load,
    )
  }

  // Every number here is 315 × percent, rounded to the nearest 5 lb. They
  // are written out rather than computed so that a change to either the
  // percentages or the rounding shows up as a diff in the expected values.
  it.each([
    [0, 'Week 1 — 5s', [205, 235, 270]],
    [1, 'Week 2 — 3s', [220, 250, 285]],
    [2, 'Week 3 — 5/3/1', [235, 270, 300]],
    [3, 'Week 4 — Deload', [125, 160, 190]],
  ])('%s prescribes %j', (index, _label, expected) => {
    expect(loadsForWeek(index)).toEqual(expected)
  })

  it('rounds every load to something a barbell can actually be loaded to', () => {
    const allLoads = [0, 1, 2, 3].flatMap(loadsForWeek)
    for (const load of allLoads) {
      expect(load).toBeDefined()
      expect((load ?? 0) % 5).toBe(0)
    }
  })

  it('puts Boring But Big at 160 lb for five sets of ten', () => {
    const week = CANONICAL_531_WEEKS[0]
    if (!week) throw new Error('missing week')

    const sets = resolveSets(supplementalPrescriptions(DEFAULT_BBB, week, 1), context)

    expect(sets).toHaveLength(5)
    expect(sets.map((set) => set.load)).toEqual([160, 160, 160, 160, 160])
    expect(sets[0]?.repsDisplay).toBe('10')
  })

  it('keeps the AMRAP set legible as an AMRAP after resolution', () => {
    const week = CANONICAL_531_WEEKS[2]
    if (!week) throw new Error('missing week')

    const sets = resolveSets(mainSetPrescriptions(week, { includeWarmups: false }), context)
    const top = sets[2]

    expect(top?.load).toBe(300)
    expect(top?.repsDisplay).toBe('1+')
    expect(top?.reps).toEqual({ kind: 'amrap', minimum: 1 })
  })

  it('adapts to a 2.5 kg gym without changing the program', () => {
    const week = CANONICAL_531_WEEKS[0]
    if (!week) throw new Error('missing week')

    const metric = {
      athlete: { ...athlete, trainingMaxes: { [SQUAT]: 142.5 }, units: 'kg' as const },
      exerciseId: SQUAT,
      roundingIncrement: 2.5,
    }

    const loads = resolveSets(mainSetPrescriptions(week, { includeWarmups: false }), metric).map(
      (set) => set.load,
    )

    // 142.5 × 65/75/85%, to the nearest 2.5 kg.
    expect(loads).toEqual([92.5, 107.5, 120])
  })
})

describe('when a number cannot be produced', () => {
  it('reports a missing training max rather than prescribing zero', () => {
    const prescription: SetPrescription = {
      load: { kind: 'percent-training-max', percent: 85 },
      reps: { kind: 'fixed', reps: 5 },
    }

    const set = resolveSet(prescription, { ...context, exerciseId: asExerciseId('unknown') })

    expect(set.load).toBeUndefined()
    expect(set.unresolved).toBe('no-training-max')
    // The intent still renders, so the lifter sees what is being asked.
    expect(set.loadDisplay).toBe('85% TM')
  })

  it('never falls back from a training max to an estimate', () => {
    // Silently swapping the basis would change what the program means
    // without saying so — a 5/3/1 cycle run off an estimated max is a
    // different, harder program.
    const prescription: SetPrescription = {
      load: { kind: 'percent-training-max', percent: 85 },
      reps: { kind: 'fixed', reps: 5 },
    }

    const set = resolveSet(prescription, { ...context, exerciseId: CURL })

    expect(set.load).toBeUndefined()
    expect(set.unresolved).toBe('no-training-max')
  })

  it('treats an open prescription as a choice, not a gap', () => {
    const set = resolveSet(
      { load: { kind: 'open' }, reps: { kind: 'range', low: 8, high: 12 } },
      context,
    )

    expect(set.loadDisplay).toBe('—')
    expect(set.repsDisplay).toBe('8–12')
    expect(missingRequirements([set])).toEqual([])
  })

  it('reports missing requirements once, not once per set', () => {
    const week = CANONICAL_531_WEEKS[0]
    if (!week) throw new Error('missing week')

    const sets = resolveSets(mainSetPrescriptions(week, { includeWarmups: true }), {
      ...context,
      exerciseId: asExerciseId('unknown'),
    })

    expect(sets).toHaveLength(6)
    expect(missingRequirements(sets)).toEqual(['no-training-max'])
  })
})

describe('non-percentage prescriptions', () => {
  it('resolves bodyweight work, with and without added load', () => {
    const plain = resolveSet(
      { load: { kind: 'bodyweight' }, reps: { kind: 'range', low: 8, high: 12 } },
      context,
    )
    expect(plain.load).toBe(180)
    expect(plain.loadDisplay).toBe('BW')

    const weighted = resolveSet(
      { load: { kind: 'bodyweight', addedLoad: 25 }, reps: { kind: 'fixed', reps: 5 } },
      context,
    )
    expect(weighted.load).toBe(205)
    expect(weighted.loadDisplay).toBe('BW +25 lb')
  })

  it('still displays bodyweight work when the bodyweight is unknown', () => {
    const { bodyweight: _omitted, ...withoutBodyweight } = athlete
    const set = resolveSet(
      { load: { kind: 'bodyweight' }, reps: { kind: 'fixed', reps: 10 } },
      { ...context, athlete: withoutBodyweight },
    )

    expect(set.load).toBeUndefined()
    expect(set.loadDisplay).toBe('BW')
  })

  it('suggests a load for an RPE-prescribed accessory', () => {
    // RPE 8 for 8 reps is 75.1% of a max; 100 × 0.751 = 75.1, rounded to 75.
    const set = resolveSet(
      { load: { kind: 'rpe', target: 8 }, reps: { kind: 'fixed', reps: 8 } },
      { ...context, exerciseId: CURL },
    )

    expect(set.load).toBe(75)
    expect(set.loadDisplay).toBe('75 lb @ RPE 8')
  })

  it('reads the top of a rep range when suggesting an RPE load', () => {
    // Choosing a load for the bottom of 8–12 would be too heavy to reach
    // twelve, so the conservative end is the right one.
    const set = resolveSet(
      { load: { kind: 'rpe', target: 8 }, reps: { kind: 'range', low: 8, high: 12 } },
      { ...context, exerciseId: CURL },
    )

    expect(set.load).toBe(65)
  })

  it('keeps an RPE set performable when no suggestion is possible', () => {
    const set = resolveSet(
      { load: { kind: 'rpe', target: 8 }, reps: { kind: 'time', seconds: 60 } },
      { ...context, exerciseId: CURL },
    )

    expect(set.load).toBeUndefined()
    expect(set.loadDisplay).toBe('RPE 8')
    expect(set.repsDisplay).toBe('60s')
  })

  it('resolves an absolute load without needing any athlete data', () => {
    const set = resolveSet(
      { load: { kind: 'absolute', load: 137.4 }, reps: { kind: 'fixed', reps: 12 } },
      {
        athlete: { trainingMaxes: {}, estimatedMaxes: {}, units: 'lb' },
        exerciseId: CURL,
        roundingIncrement: 5,
      },
    )

    expect(set.load).toBe(135)
  })
})

describe('warm-ups', () => {
  it('are marked so volume accounting can exclude them', () => {
    const week = CANONICAL_531_WEEKS[0]
    if (!week) throw new Error('missing week')

    const sets = resolveSets(mainSetPrescriptions(week, { includeWarmups: true }), context)

    expect(sets.filter((set) => set.isWarmup).map((set) => set.load)).toEqual([125, 160, 190])
    expect(sets.filter((set) => !set.isWarmup).map((set) => set.load)).toEqual([205, 235, 270])
  })
})
