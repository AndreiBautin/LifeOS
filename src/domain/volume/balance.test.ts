import { describe, expect, it } from 'vitest'

import { emptyVolumeMap } from './landmarks'
import { balanceOf, describeLean } from './balance'
import type { VolumeMap } from './accounting'

const week = (sets: Partial<VolumeMap>): VolumeMap => ({ ...emptyVolumeMap(), ...sets })

describe('training balance', () => {
  it('reads even within a tenth either way', () => {
    const [pushPull] = balanceOf([week({ chest: 10, lats: 11 })])
    expect(pushPull?.total.lean).toBeCloseTo(1 / 21)
    expect(pushPull === undefined ? '' : describeLean(pushPull)).toBe('Even')
  })

  it('says which side is heavy and by how much', () => {
    const [pushPull] = balanceOf([week({ chest: 6, lats: 8, biceps: 6 })])
    expect(pushPull === undefined ? '' : describeLean(pushPull)).toBe('Pull-heavy · 2.3×')
  })

  /* One missed pull day is noise; the four weeks are summed, not averaged. */
  it('sums the weeks and keeps each one for the drift', () => {
    const [pushPull] = balanceOf([week({ chest: 10, lats: 10 }), week({ chest: 10 })])
    expect(pushPull?.total.left).toBe(20)
    expect(pushPull?.total.right).toBe(10)
    expect(pushPull?.weeks.map((one) => one.lean)).toEqual([0, -1])
  })

  it('has no lean when nothing was logged on either side', () => {
    const [pushPull] = balanceOf([week({})])
    expect(pushPull?.total.lean).toBeUndefined()
    expect(pushPull === undefined ? '' : describeLean(pushPull)).toBe('Nothing logged')
  })
})
