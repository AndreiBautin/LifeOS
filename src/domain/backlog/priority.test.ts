import { describe, expect, it } from 'vitest'

import { PRIORITIES, PRIORITY_LABELS, PRIORITY_RANK } from './priority'

describe('PRIORITY_LABELS', () => {
  it('has exactly one label per priority with no typos or gaps', () => {
    expect(Object.keys(PRIORITY_LABELS).sort()).toEqual([...PRIORITIES].sort())
  })
})

describe('PRIORITY_RANK', () => {
  it('ranks every priority with High as most urgent and Someday as least', () => {
    expect(PRIORITY_RANK.high).toBeLessThan(PRIORITY_RANK.medium)
    expect(PRIORITY_RANK.medium).toBeLessThan(PRIORITY_RANK.low)
    expect(PRIORITY_RANK.low).toBeLessThan(PRIORITY_RANK.someday)
  })
})
