import { describe, expect, it } from 'vitest'

import {
  MAX_DIRECT_SETS_PER_SESSION,
  MINIMUM_WEEKLY_FREQUENCY,
  requiredFrequency,
  setsPerSession,
} from '@/domain/volume/frequency'

describe('requiredFrequency', () => {
  /*
   * The fault this replaces: a flat floor of two, applied to a muscle
   * owed four sets and a muscle owed twenty-two alike. Twenty-two across
   * two sessions is eleven at a time, most of which lands past the point
   * where a set still adds stimulus.
   */
  it('rises with the weekly target rather than sitting flat', () => {
    expect(requiredFrequency(4, 5)).toBe(2)
    expect(requiredFrequency(12, 5)).toBe(2)
    expect(requiredFrequency(13, 5)).toBe(3)
    expect(requiredFrequency(22, 5)).toBe(4)
  })

  it('never drops below twice, however little is owed', () => {
    expect(requiredFrequency(1, 5)).toBe(MINIMUM_WEEKLY_FREQUENCY)
  })

  /*
   * A floor that cannot be met is not a floor — the filler would add
   * slots forever trying to satisfy it.
   */
  it('never asks for more sessions than the week has', () => {
    expect(requiredFrequency(30, 3)).toBe(3)
    expect(requiredFrequency(30, 1)).toBe(1)
  })

  it('asks for nothing when nothing is owed', () => {
    expect(requiredFrequency(0, 5)).toBe(0)
    expect(requiredFrequency(12, 0)).toBe(0)
  })
})

describe('setsPerSession', () => {
  it('divides the target across the sessions it has', () => {
    expect(setsPerSession(12, 2)).toBe(6)
    expect(setsPerSession(22, 4)).toBe(6)
  })

  /*
   * The cap is the point. A muscle squeezed into fewer sessions than it
   * needs does not get a bigger session — it gets a session at the
   * ceiling and a shortfall, which is the honest outcome.
   */
  it('caps a session at the per-session ceiling regardless', () => {
    expect(setsPerSession(30, 1)).toBe(MAX_DIRECT_SETS_PER_SESSION)
  })

  it('is zero when there are no sessions', () => {
    expect(setsPerSession(12, 0)).toBe(0)
  })
})
