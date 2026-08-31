import { describe, expect, it } from 'vitest'

import { DIY_JOB_STEPS, HIRED_JOB_STEPS, JOB_APPROACHES, stepsFor } from './base'

describe('how a house job opens', () => {
  it('offers both errands', () => {
    expect(JOB_APPROACHES.map((one) => one.id)).toEqual(['hired', 'diy'])
  })

  it('opens a hired job with the errand it usually is', () => {
    expect(stepsFor('hired')).toEqual([...HIRED_JOB_STEPS])
  })

  /*
   * The gap this closes. Every job opened with the hiring steps, and on
   * one you do yourself all three are wrong — there is nobody to find,
   * nothing to quote and no appointment — so the shape had to be
   * unticked three times and typed by hand.
   */
  it('opens a job you do yourself with none of the hiring steps', () => {
    const diy = stepsFor('diy')

    expect(diy).toEqual([...DIY_JOB_STEPS])
    expect(diy.some((step) => HIRED_JOB_STEPS.includes(step as never))).toBe(false)
  })

  /*
   * The parallel is the point: both are work out what it needs, get what
   * it takes, do it. An opening with a different number of steps would
   * make one approach quietly worth more XP than the other, since every
   * closed step pays.
   */
  it('gives both the same number of steps, so neither pays more', () => {
    expect(DIY_JOB_STEPS).toHaveLength(HIRED_JOB_STEPS.length)
  })

  it('has no blank or repeated step in either', () => {
    for (const approach of JOB_APPROACHES) {
      expect(new Set(approach.steps).size).toBe(approach.steps.length)
      expect(approach.steps.every((step) => step.trim() !== '')).toBe(true)
    }
  })
})
