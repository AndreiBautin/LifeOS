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

/*
 * The report behind this: "codex work should also be tied to days, as I
 * only read/game on certain days". Without a cadence a reading goal
 * meant *every* day, so somebody reading on Tuesdays and Thursdays was
 * failing five days a week — a streak that could only ever be one, and a
 * board saying they were behind on a book they were not behind on.
 *
 * NOW is 2026-08-19, a Wednesday. `days` is Sunday-indexed to match
 * `Date.getDay()`, the same as a habit's cadence.
 */
describe('a goal tied to certain days', () => {
  const WEDNESDAY = 3
  const TUESDAY = 2

  it('is not due on a day its cadence does not name', () => {
    const item = buildGoalItem({
      dailyGoal: { amount: 1, unit: 'chapter', cadence: { kind: 'days-of-week', days: [TUESDAY] } },
    })

    expect(getDailyGoalBoard([item], NOW).statuses[0]?.isDueToday).toBe(false)
  })

  it('is due on a day its cadence names', () => {
    const item = buildGoalItem({
      dailyGoal: {
        amount: 1,
        unit: 'chapter',
        cadence: { kind: 'days-of-week', days: [WEDNESDAY] },
      },
    })

    expect(getDailyGoalBoard([item], NOW).statuses[0]?.isDueToday).toBe(true)
  })

  it('is due every day when no cadence was set', () => {
    // Every goal written before cadences existed has none, and reads
    // correctly as "no restriction" rather than as "never".
    expect(getDailyGoalBoard([buildGoalItem()], NOW).statuses[0]?.isDueToday).toBe(true)
  })

  /*
   * "2 of 5" on a Wednesday when three of the five are Tuesday goals
   * reads as being behind while nothing is outstanding — the same defect
   * Today had when it listed habits that were not due.
   */
  it('counts only what is due towards the day', () => {
    const today = buildGoalItem({
      title: 'Due today',
      dailyGoal: {
        amount: 1,
        unit: 'chapter',
        cadence: { kind: 'days-of-week', days: [WEDNESDAY] },
      },
    })
    const other = buildGoalItem({
      title: 'Tuesdays',
      dailyGoal: { amount: 1, unit: 'level', cadence: { kind: 'days-of-week', days: [TUESDAY] } },
    })

    const board = getDailyGoalBoard([today, other], NOW)

    expect(board.totalCount).toBe(1)
    // Still listed — logging on a day you did not plan to read happens,
    // and an item that vanished on Wednesday would read as lost.
    expect(board.statuses).toHaveLength(2)
  })

  it('is complete when everything due is done, ignoring what is not', () => {
    const done = buildGoalItem({
      dailyGoal: {
        amount: 1,
        unit: 'chapter',
        cadence: { kind: 'days-of-week', days: [WEDNESDAY] },
      },
      dailyProgress: metDays(['2026-08-19']),
    })
    const notDue = buildGoalItem({
      title: 'Tuesdays',
      dailyGoal: { amount: 1, unit: 'level', cadence: { kind: 'days-of-week', days: [TUESDAY] } },
    })

    expect(getDailyGoalBoard([done, notDue], NOW).allMet).toBe(true)
  })

  /*
   * The rule that makes the whole thing worth having, and the same one
   * `streakFor` holds for habits: a day the goal was not expected on
   * does not break the run.
   */
  it('does not break a streak on a day the goal was not expected', () => {
    const item = buildGoalItem({
      dailyGoal: { amount: 1, unit: 'chapter', cadence: { kind: 'days-of-week', days: [TUESDAY] } },
      // Three Tuesdays running. Every day between them is unlogged.
      dailyProgress: metDays(['2026-08-04', '2026-08-11', '2026-08-18']),
    })

    expect(getDailyGoalBoard([item], NOW).statuses[0]?.currentStreak).toBe(3)
  })

  it('still breaks on a missed day it was expected on', () => {
    const item = buildGoalItem({
      dailyGoal: { amount: 1, unit: 'chapter', cadence: { kind: 'days-of-week', days: [TUESDAY] } },
      // 2026-08-11 is missing: a Tuesday that was expected and skipped.
      dailyProgress: metDays(['2026-08-04', '2026-08-18']),
    })

    expect(getDailyGoalBoard([item], NOW).statuses[0]?.currentStreak).toBe(1)
  })

  it('survives a cadence that names no days at all', () => {
    // Expected on nothing. A `while` loop looking for the next covered
    // day would spin forever; the walk is bounded instead.
    const item = buildGoalItem({
      dailyGoal: { amount: 1, unit: 'chapter', cadence: { kind: 'days-of-week', days: [] } },
    })

    const board = getDailyGoalBoard([item], NOW)

    expect(board.statuses[0]?.currentStreak).toBe(0)
    expect(board.totalCount).toBe(0)
  })

  it('does not mark an off day as missed on the history strip', () => {
    const item = buildGoalItem({
      dailyGoal: { amount: 1, unit: 'chapter', cadence: { kind: 'days-of-week', days: [TUESDAY] } },
      dailyProgress: metDays(['2026-08-18']),
    })

    const days = getDailyGoalBoard([item], NOW).statuses[0]?.recentDays ?? []

    // 2026-08-17 is a Monday: never expected, so not a gap in the strip.
    expect(days.find((day) => day.date === '2026-08-17')?.isMet).toBe(true)
  })
})
