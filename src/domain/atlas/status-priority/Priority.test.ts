import { describe, expect, it } from 'vitest'
import { isPriority, PRIORITIES, PRIORITY_METADATA } from './Priority'

describe('Priority', () => {
  it('has metadata with a sort weight for every priority', () => {
    for (const priority of PRIORITIES) {
      expect(PRIORITY_METADATA[priority].label).toBeTruthy()
      expect(typeof PRIORITY_METADATA[priority].sortWeight).toBe('number')
    }
  })

  it('ranks mustVisit ahead of someday', () => {
    expect(PRIORITY_METADATA.mustVisit.sortWeight).toBeLessThan(
      PRIORITY_METADATA.someday.sortWeight,
    )
  })

  it('identifies valid priority strings', () => {
    expect(isPriority('high')).toBe(true)
  })

  it('rejects unknown priority strings', () => {
    expect(isPriority('urgent')).toBe(false)
  })
})
