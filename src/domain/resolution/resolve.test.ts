import { describe, expect, it } from 'vitest'

import { asExerciseId } from '@/domain/ids/ids'
import type { SetPrescription } from '@/domain/programs/prescription'

import { missingRequirements, resolveSet, resolveSets, type AthleteState } from './resolve'

const SQUAT = asExerciseId('squat')
const CURL = asExerciseId('curl')

const athlete: AthleteState = {
  estimatedMaxes: { [SQUAT]: 350, [CURL]: 100 },
  bodyweight: 180,
  units: 'lb',
}

const context = { athlete, exerciseId: SQUAT, roundingIncrement: 5 }

describe('resolving against an estimated max', () => {
  it('multiplies and rounds to the gym increment', () => {
    const set = resolveSet(
      { load: { kind: 'percent-e1rm', percent: 85 }, reps: { kind: 'fixed', reps: 5 } },
      context,
    )

    // 350 × 0.85 = 297.5, to the nearest 5 — halves round up.
    expect(set.load).toBe(300)
    expect(set.loadDisplay).toBe('300 lb')
  })

  it('adapts to a 2.5 kg gym without changing the prescription', () => {
    const metric = {
      athlete: { ...athlete, estimatedMaxes: { [SQUAT]: 158 }, units: 'kg' as const },
      exerciseId: SQUAT,
      roundingIncrement: 2.5,
    }

    const set = resolveSet(
      { load: { kind: 'percent-e1rm', percent: 75 }, reps: { kind: 'fixed', reps: 5 } },
      metric,
    )

    // 158 × 0.75 = 118.5, to the nearest 2.5 kg.
    expect(set.load).toBe(117.5)
  })
})

describe('when a number cannot be produced', () => {
  it('reports the missing estimate rather than prescribing zero', () => {
    // A `0 lb` placeholder is the worst of the options because it looks
    // like an answer. The intent still renders so the lifter can see what
    // is being asked and load the bar themselves.
    const prescription: SetPrescription = {
      load: { kind: 'percent-e1rm', percent: 85 },
      reps: { kind: 'fixed', reps: 5 },
    }

    const set = resolveSet(prescription, { ...context, exerciseId: asExerciseId('unknown') })

    expect(set.load).toBeUndefined()
    expect(set.unresolved).toBe('no-estimated-max')
    expect(set.loadDisplay).toBe('85% e1RM')
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
    const sets = resolveSets(
      Array.from({ length: 5 }, () => ({
        load: { kind: 'percent-e1rm' as const, percent: 70 },
        reps: { kind: 'fixed' as const, reps: 5 },
      })),
      { ...context, exerciseId: asExerciseId('unknown') },
    )

    expect(sets).toHaveLength(5)
    expect(missingRequirements(sets)).toEqual(['no-estimated-max'])
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
    expect(set.repsDisplay).toBe('1 min')
  })

  it('resolves an absolute load without needing any athlete data', () => {
    const set = resolveSet(
      { load: { kind: 'absolute', load: 137.4 }, reps: { kind: 'fixed', reps: 12 } },
      {
        athlete: { estimatedMaxes: {}, units: 'lb' },
        exerciseId: CURL,
        roundingIncrement: 5,
      },
    )

    expect(set.load).toBe(135)
  })
})

describe('warm-ups', () => {
  it('are marked so volume accounting can exclude them', () => {
    const sets = resolveSets(
      [
        {
          load: { kind: 'percent-e1rm', percent: 40 },
          reps: { kind: 'fixed', reps: 5 },
          isWarmup: true,
        },
        {
          load: { kind: 'percent-e1rm', percent: 60 },
          reps: { kind: 'fixed', reps: 3 },
          isWarmup: true,
        },
        { load: { kind: 'percent-e1rm', percent: 80 }, reps: { kind: 'fixed', reps: 5 } },
      ],
      context,
    )

    expect(sets.filter((set) => set.isWarmup).map((set) => set.load)).toEqual([140, 210])
    expect(sets.filter((set) => !set.isWarmup).map((set) => set.load)).toEqual([280])
  })
})
