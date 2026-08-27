import { describe, expect, it } from 'vitest'

import type { Exercise } from '@/domain/exercises/exercise'
import type { SetPrescription } from '@/domain/programs/prescription'

import { countsAsWorking, slotVolume } from './accounting'

/**
 * One set, one muscle, one count.
 *
 * This file used to test two layers of fractional credit — a set scaled by
 * reps and proximity to failure, then paid out again at half to every
 * secondary mover. Both are gone, and what is worth testing now is that
 * nothing crept back in: the arithmetic is a filter and a length, and the
 * only way it goes wrong is by counting something it should not.
 */
const bench = {
  id: 'bench-press',
  slug: 'bench-press',
  name: 'Bench Press',
  primaryMuscle: 'chest',
  secondaryMuscles: ['triceps', 'front-delts'],
} as unknown as Exercise

const working = (reps: number, rpe?: number): SetPrescription =>
  ({
    reps: { kind: 'fixed', reps },
    load: rpe === undefined ? { kind: 'none' } : { kind: 'rpe', target: rpe },
  }) as unknown as SetPrescription

const warmup = (): SetPrescription =>
  ({
    reps: { kind: 'fixed', reps: 5 },
    load: { kind: 'none' },
    isWarmup: true,
  }) as unknown as SetPrescription

describe('what a slot is worth', () => {
  it('counts each working set once, for the muscle it is for', () => {
    expect(slotVolume(bench, [working(8), working(8), working(8)]).chest).toBe(3)
  })

  /*
   * The change this file exists to pin. A heavy triple and a set of ten
   * are both one set now — the first used to be worth less, and an RPE 8
   * set less again. Two coefficients, neither checkable against a
   * training log.
   */
  it('counts a heavy triple the same as a set of ten', () => {
    expect(slotVolume(bench, [working(3, 8)]).chest).toBe(
      slotVolume(bench, [working(10, 10)]).chest,
    )
  })

  /*
   * A bench press pays the triceps nothing. That is a real loss of
   * fidelity, taken deliberately: it is now visible on the Plan screen as
   * triceps work that has to be scheduled, rather than hidden in a 0.5
   * that nobody could audit.
   */
  it('pays a secondary muscle nothing at all', () => {
    const volume = slotVolume(bench, [working(8), working(8)])

    expect(volume.chest).toBe(2)
    expect(volume.triceps).toBe(0)
    expect(volume['front-delts']).toBe(0)
  })

  it('ignores warm-ups', () => {
    expect(slotVolume(bench, [warmup(), warmup(), working(8)]).chest).toBe(1)
  })

  it('is empty when a slot is all warm-up', () => {
    expect(slotVolume(bench, [warmup()]).chest).toBe(0)
  })

  it('knows a warm-up from a working set', () => {
    expect(countsAsWorking(working(8))).toBe(true)
    expect(countsAsWorking(warmup())).toBe(false)
  })
})
