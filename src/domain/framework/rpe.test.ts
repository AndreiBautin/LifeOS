import { describe, expect, it } from 'vitest'

import { coachRpe, describeRpe, RPE_SCALE } from '@/domain/framework/rpe'

describe('describeRpe', () => {
  it('reads an exact step off the scale', () => {
    expect(describeRpe(8)?.rir).toBe('2')
    expect(describeRpe(10)?.rir).toBe('0')
  })

  /*
   * The rounding direction is the part worth pinning. Snapping upward
   * would tell a lifter who reported 8.7 that they had one rep left, and
   * every load derived from that reading would come out heavy.
   */
  it('snaps down rather than to the nearest step', () => {
    expect(describeRpe(8.7)?.rpe).toBe(8.5)
    expect(describeRpe(9.9)?.rpe).toBe(9.5)
  })

  it('caps above ten rather than falling off the end', () => {
    expect(describeRpe(11)?.rpe).toBe(10)
  })

  it('treats anything under the bottom step as unreadable', () => {
    expect(describeRpe(3)).toBeUndefined()
    expect(describeRpe(Number.NaN)).toBeUndefined()
  })

  it('is ordered high to low, which is what the downward snap relies on', () => {
    const values = RPE_SCALE.map((entry) => entry.rpe)
    expect([...values].sort((a, b) => b - a)).toEqual(values)
  })
})

describe('coachRpe', () => {
  it('phrases a sub-maximal target as a stopping instruction', () => {
    expect(coachRpe(8)).toMatch(/^Stop with about 2 reps left\./)
  })

  it('says one rep, not one reps', () => {
    expect(coachRpe(9)).toMatch(/about 1 rep left/)
  })

  it('does not tell a lifter to stop short of failure at RPE 10', () => {
    expect(coachRpe(10)).toBe('Take it to failure — the next rep should not be there.')
  })
})
