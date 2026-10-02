import { describe, expect, it } from 'vitest'

import { describeHeft, HEFTS, heftOf } from './heft'

describe('a session total as a picture', () => {
  it('picks the heaviest thing the total covers, so the count is at least one', () => {
    const comparison = heftOf(14_000, 'kg')
    expect(comparison?.heft.name).toBe('school bus')
    expect(comparison?.count).toBe(1.3)
  })

  it('lands pounds and kilos on the same object', () => {
    // 18,000 lb is about 8,165 kg.
    expect(heftOf(18_000, 'lb')?.heft.name).toBe('T. rex')
    expect(heftOf(8_165, 'kg')?.heft.name).toBe('T. rex')
  })

  it('rounds to a whole number once there are ten or more', () => {
    expect(heftOf(5_400, 'kg')).toEqual({ heft: HEFTS[1], count: 3.6 })
    expect(heftOf(500_000, 'kg')).toEqual({ heft: HEFTS[6], count: 12 })
  })

  it('has nothing to compare a very light session with', () => {
    expect(heftOf(300, 'kg')).toBeUndefined()
  })

  it('names one in the singular', () => {
    const elephant = { name: 'African elephant', plural: 'African elephants', kg: 6_000 }
    expect(describeHeft({ heft: elephant, count: 1 })).toBe('1 African elephant')
    expect(describeHeft({ heft: elephant, count: 2.4 })).toBe('2.4 African elephants')
  })
})
