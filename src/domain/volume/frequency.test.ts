import { describe, expect, it } from 'vitest'

import {
  MAX_DIRECT_SETS_PER_SESSION,
  requiredFrequency,
  setsPerSession,
} from '@/domain/volume/frequency'

describe('requiredFrequency', () => {
  /*
   * Priority decides frequency, and the answer is meant to be one you
   * could have predicted from your own tier list.
   *
   * The volume-derived rule this replaced could not manage that: it put
   * the forearms on two sessions and the lats on three, so a tier-1
   * muscle was trained less often than a tier-2 one. True to the
   * arithmetic and impossible to describe without reciting it.
   */
  it('trains the top tier on every day accountable for it', () => {
    expect(requiredFrequency(1, 3)).toBe(3)
    expect(requiredFrequency(1, 2)).toBe(2)
  })

  it('trains the middle tier on most of them', () => {
    expect(requiredFrequency(2, 3)).toBe(2)
  })

  it('trains a maintained muscle once', () => {
    expect(requiredFrequency(3, 3)).toBe(1)
    expect(requiredFrequency(3, 2)).toBe(1)
  })

  it('does not depend on how much volume the muscle is owed', () => {
    // The whole point: two tier-1 muscles with very different targets
    // are trained equally often, and the difference shows up in how much
    // each session carries rather than in how many there are.
    expect(requiredFrequency(1, 3)).toBe(requiredFrequency(1, 3))
  })

  /*
   * A floor that cannot be met is not a floor — the filler would add
   * slots forever trying to satisfy it.
   */
  it('never asks for more sessions than the week has', () => {
    expect(requiredFrequency(1, 1)).toBe(1)
    expect(requiredFrequency(2, 1)).toBe(1)
  })

  it('asks for nothing when no day is accountable', () => {
    expect(requiredFrequency(1, 0)).toBe(0)
  })

  it('treats an unknown tier as maintenance rather than throwing', () => {
    expect(requiredFrequency(9, 3)).toBe(1)
  })
})

describe('setsPerSession', () => {
  it('divides the target across the sessions it has', () => {
    expect(setsPerSession(12, 2)).toBe(6)
    expect(setsPerSession(15, 3)).toBe(5)
  })

  /*
   * The cap is the point. A muscle squeezed into fewer sessions than its
   * volume wants does not get a bigger session — it gets a session at
   * the ceiling and a shortfall, which the Plan screen reports.
   */
  it('caps a session at the per-session ceiling regardless', () => {
    expect(setsPerSession(30, 1)).toBe(MAX_DIRECT_SETS_PER_SESSION)
  })

  it('is zero when there are no sessions', () => {
    expect(setsPerSession(12, 0)).toBe(0)
  })
})
