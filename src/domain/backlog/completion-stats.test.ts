import { describe, expect, it } from 'vitest'

import { buildItem } from '@/test/builders/backlog-item'

import { getCompletionStats } from './completion-stats'

const NOW = new Date('2026-03-15T00:00:00.000Z')

describe('getCompletionStats', () => {
  it('counts total backlog items', () => {
    const items = [
      buildItem({ status: 'backlog' }),
      buildItem({ status: 'backlog' }),
      buildItem({ status: 'completed' }),
    ]

    expect(getCompletionStats(items, NOW).totalBacklog).toBe(2)
  })

  it('counts items completed this month and this year', () => {
    const items = [
      buildItem({ status: 'completed', dateCompleted: '2026-03-10T00:00:00.000Z' }),
      buildItem({ status: 'completed', dateCompleted: '2026-01-05T00:00:00.000Z' }),
      buildItem({ status: 'completed', dateCompleted: '2025-12-20T00:00:00.000Z' }),
      buildItem({ status: 'backlog' }),
    ]

    const stats = getCompletionStats(items, NOW)

    expect(stats.completedThisMonth).toBe(1)
    expect(stats.completedThisYear).toBe(2)
  })

  it('computes completion percentage rounded to the nearest whole number', () => {
    const items = [
      buildItem({ status: 'completed', dateCompleted: '2026-03-01T00:00:00.000Z' }),
      buildItem({ status: 'backlog' }),
      buildItem({ status: 'backlog' }),
    ]

    expect(getCompletionStats(items, NOW).completionPercentage).toBe(33)
  })

  it('returns 0% completion for an empty backlog instead of dividing by zero', () => {
    expect(getCompletionStats([], NOW).completionPercentage).toBe(0)
  })

  it('tallies items by category, including categories with zero items', () => {
    const items = [
      buildItem({ category: 'games' }),
      buildItem({ category: 'games' }),
      buildItem({ category: 'books' }),
    ]

    const stats = getCompletionStats(items, NOW)

    expect(stats.itemsByCategory.games).toBe(2)
    expect(stats.itemsByCategory.books).toBe(1)
    expect(stats.itemsByCategory.movies).toBe(0)
  })
})
