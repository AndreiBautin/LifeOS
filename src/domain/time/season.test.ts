import { describe, expect, it } from 'vitest'

import { seasonOf } from './season'

describe('the season a date falls in', () => {
  it('puts December with the winter that follows it', () => {
    expect(seasonOf(new Date(2025, 11, 20))).toBe('winter')
    expect(seasonOf(new Date(2026, 0, 5))).toBe('winter')
  })

  it('breaks on whole months', () => {
    expect(seasonOf(new Date(2026, 2, 1))).toBe('spring')
    expect(seasonOf(new Date(2026, 5, 1))).toBe('summer')
    expect(seasonOf(new Date(2026, 8, 1))).toBe('autumn')
    expect(seasonOf(new Date(2026, 10, 30))).toBe('autumn')
  })
})
