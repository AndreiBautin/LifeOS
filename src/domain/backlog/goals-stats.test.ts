import { describe, expect, it } from 'vitest'

import { buildItem } from '@/test/builders/backlog-item'

import { getGoalsStats } from './goals-stats'

const NOW = new Date('2026-03-15T00:00:00.000Z')

describe('getGoalsStats — currentStreak', () => {
  it('is 0 when nothing has ever been completed', () => {
    expect(getGoalsStats([], NOW).currentStreak).toBe(0)
  })

  it('is 0 when the current month has no completion, even if past months do', () => {
    const items = [
      buildItem({ status: 'completed', dateCompleted: '2026-02-10T00:00:00.000Z' }),
      buildItem({ status: 'completed', dateCompleted: '2026-01-10T00:00:00.000Z' }),
    ]

    expect(getGoalsStats(items, NOW).currentStreak).toBe(0)
  })

  it('counts consecutive months back from the current month', () => {
    const items = [
      buildItem({ status: 'completed', dateCompleted: '2026-03-01T00:00:00.000Z' }),
      buildItem({ status: 'completed', dateCompleted: '2026-02-10T00:00:00.000Z' }),
      buildItem({ status: 'completed', dateCompleted: '2026-01-20T00:00:00.000Z' }),
    ]

    expect(getGoalsStats(items, NOW).currentStreak).toBe(3)
  })

  it('stops counting at the first gap month', () => {
    const items = [
      buildItem({ status: 'completed', dateCompleted: '2026-03-01T00:00:00.000Z' }),
      // no completion in February
      buildItem({ status: 'completed', dateCompleted: '2026-01-20T00:00:00.000Z' }),
    ]

    expect(getGoalsStats(items, NOW).currentStreak).toBe(1)
  })
})

describe('getGoalsStats — completedThisMonth / completedThisYear', () => {
  it('matches the same counts getCompletionStats would produce', () => {
    const items = [
      buildItem({ status: 'completed', dateCompleted: '2026-03-10T00:00:00.000Z' }),
      buildItem({ status: 'completed', dateCompleted: '2025-12-01T00:00:00.000Z' }),
      buildItem({ status: 'backlog' }),
    ]

    const stats = getGoalsStats(items, NOW)

    expect(stats.completedThisMonth).toBe(1)
    expect(stats.completedThisYear).toBe(1)
  })
})

describe('getGoalsStats — averageCompletionsPerMonth', () => {
  it('is 0 when nothing has been completed', () => {
    expect(getGoalsStats([], NOW).averageCompletionsPerMonth).toBe(0)
  })

  it('divides total completions by the number of months since the first one', () => {
    const items = [
      buildItem({ status: 'completed', dateCompleted: '2026-01-10T00:00:00.000Z' }),
      buildItem({ status: 'completed', dateCompleted: '2026-02-05T00:00:00.000Z' }),
      buildItem({ status: 'completed', dateCompleted: '2026-03-01T00:00:00.000Z' }),
      buildItem({ status: 'completed', dateCompleted: '2026-03-10T00:00:00.000Z' }),
    ]

    // 4 completions across Jan/Feb/Mar (3 months, inclusive) = 1.333... -> 1.3
    expect(getGoalsStats(items, NOW).averageCompletionsPerMonth).toBe(1.3)
  })
})

describe('getGoalsStats — averageBacklogAgeDays', () => {
  it('is 0 when there are no unfinished items', () => {
    expect(getGoalsStats([], NOW).averageBacklogAgeDays).toBe(0)
  })

  it('averages the age of unfinished items only, excluding completed and dropped', () => {
    const items = [
      buildItem({ status: 'backlog', dateAdded: '2026-03-05T00:00:00.000Z' }), // 10 days old
      buildItem({ status: 'currently-using', dateAdded: '2026-02-23T00:00:00.000Z' }), // 20 days old
      buildItem({ status: 'completed', dateAdded: '2020-01-01T00:00:00.000Z' }),
      buildItem({ status: 'dropped', dateAdded: '2020-01-01T00:00:00.000Z' }),
    ]

    expect(getGoalsStats(items, NOW).averageBacklogAgeDays).toBe(15)
  })
})

describe('getGoalsStats — oldestUnfinishedItem', () => {
  it('is null when there are no unfinished items', () => {
    expect(getGoalsStats([], NOW).oldestUnfinishedItem).toBeNull()
  })

  it('picks the unfinished item with the earliest dateAdded', () => {
    const newer = buildItem({
      title: 'Newer',
      status: 'backlog',
      dateAdded: '2026-03-05T00:00:00.000Z',
    })
    const older = buildItem({
      title: 'Older',
      status: 'currently-using',
      dateAdded: '2026-02-23T00:00:00.000Z',
    })
    const oldestButCompleted = buildItem({
      title: 'Oldest but completed',
      status: 'completed',
      dateAdded: '2020-01-01T00:00:00.000Z',
    })

    const result = getGoalsStats([newer, older, oldestButCompleted], NOW).oldestUnfinishedItem

    expect(result?.title).toBe('Older')
  })
})
