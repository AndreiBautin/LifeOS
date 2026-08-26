import { describe, expect, it } from 'vitest'

import { buildItem } from '@/test/builders/backlog-item'

import { getDailyGoalBoard, RECENT_DAY_COUNT } from './daily-goals'

const NOW = new Date(2026, 7, 19, 10, 0)

/** Builds a currently-using item with a goal and a log of met days. */
function buildGoalItem(overrides: Parameters<typeof buildItem>[0] = {}) {
  return buildItem({
    status: 'currently-using',
    dailyGoal: { amount: 1, unit: 'chapter' },
    ...overrides,
  })
}

function metDays(dates: readonly string[], amount = 1) {
  return dates.map((date) => ({ date, amount }))
}

describe('getDailyGoalBoard', () => {
  it('includes only in-progress items that have a daily goal', () => {
    const tracked = buildGoalItem({ title: 'Tracked' })
    const noGoal = buildItem({ title: 'No goal', status: 'currently-using' })
    const notStarted = buildGoalItem({ title: 'Backlogged', status: 'backlog' })
    const paused = buildGoalItem({ title: 'Paused', status: 'paused' })

    const board = getDailyGoalBoard([tracked, noGoal, notStarted, paused], NOW)

    expect(board.statuses.map((status) => status.item.title)).toEqual(['Tracked'])
  })

  it('orders entries by title so the list never reshuffles as goals are met', () => {
    const items = [
      buildGoalItem({ title: 'Severance' }),
      buildGoalItem({ title: 'Hades II' }),
      buildGoalItem({ title: 'The Way of Kings' }),
    ]

    const board = getDailyGoalBoard(items, NOW)

    expect(board.statuses.map((status) => status.item.title)).toEqual([
      'Hades II',
      'Severance',
      'The Way of Kings',
    ])
  })

  it('reports today’s logged amount against the target', () => {
    const item = buildGoalItem({
      dailyGoal: { amount: 2, unit: 'episode' },
      dailyProgress: metDays(['2026-08-19']),
    })

    const [status] = getDailyGoalBoard([item], NOW).statuses

    expect(status).toMatchObject({ loggedToday: 1, target: 2, isMet: false })
  })

  it('counts a goal as met once the logged amount reaches the target', () => {
    const item = buildGoalItem({
      dailyGoal: { amount: 2, unit: 'episode' },
      dailyProgress: metDays(['2026-08-19'], 2),
    })

    const [status] = getDailyGoalBoard([item], NOW).statuses

    expect(status?.isMet).toBe(true)
  })

  it('summarises how many of today’s goals are done', () => {
    const done = buildGoalItem({ title: 'Done', dailyProgress: metDays(['2026-08-19']) })
    const pending = buildGoalItem({ title: 'Pending' })

    const board = getDailyGoalBoard([done, pending], NOW)

    expect(board).toMatchObject({ metCount: 1, totalCount: 2, allMet: false })
  })

  it('reports allMet only when every tracked goal is done', () => {
    const item = buildGoalItem({ dailyProgress: metDays(['2026-08-19']) })

    expect(getDailyGoalBoard([item], NOW).allMet).toBe(true)
  })

  it('is not "all met" when nothing is tracked at all', () => {
    const board = getDailyGoalBoard([buildItem()], NOW)

    expect(board).toMatchObject({ totalCount: 0, allMet: false })
  })

  describe('current streak', () => {
    it('counts consecutive met days back from today', () => {
      const item = buildGoalItem({
        dailyProgress: metDays(['2026-08-17', '2026-08-18', '2026-08-19']),
      })

      expect(getDailyGoalBoard([item], NOW).statuses[0]?.currentStreak).toBe(3)
    })

    it('keeps yesterday’s streak alive while today is still unlogged', () => {
      const item = buildGoalItem({ dailyProgress: metDays(['2026-08-17', '2026-08-18']) })

      expect(getDailyGoalBoard([item], NOW).statuses[0]?.currentStreak).toBe(2)
    })

    it('breaks once a whole day has been missed', () => {
      const item = buildGoalItem({ dailyProgress: metDays(['2026-08-16', '2026-08-17']) })

      expect(getDailyGoalBoard([item], NOW).statuses[0]?.currentStreak).toBe(0)
    })

    it('does not count a day that fell short of the target', () => {
      const item = buildGoalItem({
        dailyGoal: { amount: 2, unit: 'episode' },
        dailyProgress: [
          { date: '2026-08-17', amount: 2 },
          { date: '2026-08-18', amount: 1 },
          { date: '2026-08-19', amount: 2 },
        ],
      })

      expect(getDailyGoalBoard([item], NOW).statuses[0]?.currentStreak).toBe(1)
    })

    it('is zero for an item with no progress at all', () => {
      expect(getDailyGoalBoard([buildGoalItem()], NOW).statuses[0]?.currentStreak).toBe(0)
    })
  })

  describe('longest streak', () => {
    it('finds the best run in the log, past or present', () => {
      const item = buildGoalItem({
        dailyProgress: metDays([
          '2026-08-01',
          '2026-08-02',
          '2026-08-03',
          '2026-08-04',
          '2026-08-18',
          '2026-08-19',
        ]),
      })

      const [status] = getDailyGoalBoard([item], NOW).statuses

      expect(status).toMatchObject({ longestStreak: 4, currentStreak: 2 })
    })

    it('is never shorter than the current streak', () => {
      const item = buildGoalItem({ dailyProgress: metDays(['2026-08-18', '2026-08-19']) })

      expect(getDailyGoalBoard([item], NOW).statuses[0]?.longestStreak).toBe(2)
    })
  })

  describe('recent days', () => {
    it('returns a fixed-length window ending today, oldest first', () => {
      const [status] = getDailyGoalBoard([buildGoalItem()], NOW).statuses
      const days = status?.recentDays ?? []

      expect(days).toHaveLength(RECENT_DAY_COUNT)
      expect(days[0]?.date).toBe('2026-08-06')
      expect(days.at(-1)?.date).toBe('2026-08-19')
    })

    it('marks which days in the window hit the target', () => {
      const item = buildGoalItem({ dailyProgress: metDays(['2026-08-18']) })

      const [status] = getDailyGoalBoard([item], NOW, 3).statuses

      expect(status?.recentDays).toEqual([
        { date: '2026-08-17', amount: 0, isMet: false },
        { date: '2026-08-18', amount: 1, isMet: true },
        { date: '2026-08-19', amount: 0, isMet: false },
      ])
    })
  })
})
