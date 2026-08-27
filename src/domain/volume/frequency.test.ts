import { describe, expect, it } from 'vitest'

import {
  MAX_DIRECT_SETS_PER_SESSION,
  requiredFrequency,
  setsPerSession,
} from '@/domain/volume/frequency'

/*
 * Frequency is a setting now, not a derivation.
 *
 * This file used to test a tier-to-frequency table and the rounding that
 * came with it — two thirds of a day count, ceiled, so a middle tier on a
 * two-day pool took both days rather than rounding down to one. All of
 * that machinery is gone: a muscle carries the number of sessions it
 * wants and this function does one thing, which is refuse to promise more
 * sessions than the split has days for.
 *
 * The rounding case is worth remembering even though it can no longer
 * happen. It produced a frequency table nobody could predict from their
 * own settings, and the fix each time was another rule. Asking the lifter
 * was the fix that worked.
 */
describe('requiredFrequency', () => {
  it('gives a muscle the sessions it asks for', () => {
    expect(requiredFrequency(2, 3)).toBe(2)
    expect(requiredFrequency(3, 3)).toBe(3)
    expect(requiredFrequency(1, 3)).toBe(1)
  })

  it('gives nothing to a muscle that asks for nothing', () => {
    // Zero is a real answer and the one most muscles are on: the
    // competition lifts pay them and no slot is scheduled.
    expect(requiredFrequency(0, 3)).toBe(0)
    expect(requiredFrequency(0, 0)).toBe(0)
  })

  /*
   * A floor that cannot be met is not a floor — the filler would add
   * slots forever trying to satisfy it. What the week cannot deliver is
   * reported on the Plan screen instead.
   */
  it('never asks for more sessions than the week has', () => {
    expect(requiredFrequency(3, 1)).toBe(1)
    expect(requiredFrequency(2, 1)).toBe(1)
  })

  it('asks for nothing when no day is accountable', () => {
    expect(requiredFrequency(3, 0)).toBe(0)
  })

  it('treats a negative setting as none rather than throwing', () => {
    expect(requiredFrequency(-1, 3)).toBe(0)
  })
})

describe('setsPerSession', () => {
  it('divides the target across the sessions it has', () => {
    expect(setsPerSession(6, 2)).toBe(3)
    expect(setsPerSession(10, 2)).toBe(5)
  })

  it('rounds up rather than leaving a set unplaced', () => {
    expect(setsPerSession(7, 2)).toBe(4)
  })

  it('caps a session at the per-session ceiling regardless', () => {
    expect(setsPerSession(30, 1)).toBe(MAX_DIRECT_SETS_PER_SESSION)
  })

  it('is zero when there are no sessions', () => {
    expect(setsPerSession(12, 0)).toBe(0)
  })
})
