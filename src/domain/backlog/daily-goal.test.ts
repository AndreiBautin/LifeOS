import { describe, expect, it } from 'vitest'

import { BacklogValidationError } from './errors'
import {
  applyProgressDelta,
  formatDailyGoal,
  getProgressOn,
  isPlausibleDailyGoal,
  isPlausibleProgressEntry,
  requireDailyGoal,
  shiftDateKey,
  toDateKey,
} from './daily-goal'

describe('toDateKey', () => {
  it('formats a date as its local calendar day, zero-padded', () => {
    expect(toDateKey(new Date(2026, 7, 9, 13, 45))).toBe('2026-08-09')
  })

  it('uses the local day even late at night, when UTC has already rolled over', () => {
    const lateEvening = new Date(2026, 7, 19, 23, 59)

    expect(toDateKey(lateEvening)).toBe('2026-08-19')
  })
})

describe('shiftDateKey', () => {
  it('walks backwards across a month boundary', () => {
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('walks forwards across a year boundary', () => {
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles leap days', () => {
    expect(shiftDateKey('2028-03-01', -1)).toBe('2028-02-29')
  })
})

describe('requireDailyGoal', () => {
  it('trims the unit and keeps a valid amount', () => {
    expect(requireDailyGoal({ amount: 2, unit: '  episode ' })).toEqual({
      amount: 2,
      unit: 'episode',
    })
  })

  it('rejects an empty unit', () => {
    expect(() => requireDailyGoal({ amount: 1, unit: '   ' })).toThrow(BacklogValidationError)
  })

  it('rejects an amount below one', () => {
    expect(() => requireDailyGoal({ amount: 0, unit: 'chapter' })).toThrow(BacklogValidationError)
  })

  it('rejects a fractional amount', () => {
    expect(() => requireDailyGoal({ amount: 1.5, unit: 'chapter' })).toThrow(BacklogValidationError)
  })
})

describe('formatDailyGoal', () => {
  it('leaves the unit singular for an amount of one', () => {
    expect(formatDailyGoal({ amount: 1, unit: 'chapter' })).toBe('1 chapter/day')
  })

  it('pluralizes the unit for larger amounts', () => {
    expect(formatDailyGoal({ amount: 2, unit: 'episode' })).toBe('2 episodes/day')
  })

  it('does not double up an s on an already-plural unit', () => {
    expect(formatDailyGoal({ amount: 3, unit: 'pages' })).toBe('3 pages/day')
  })
})

describe('getProgressOn', () => {
  const entries = [{ date: '2026-08-18', amount: 3 }]

  it('reads the amount logged on a day', () => {
    expect(getProgressOn(entries, '2026-08-18')).toBe(3)
  })

  it('reports zero for a day with no entry', () => {
    expect(getProgressOn(entries, '2026-08-19')).toBe(0)
  })
})

describe('applyProgressDelta', () => {
  it('adds an entry for a day that has none', () => {
    expect(applyProgressDelta([], '2026-08-19', 1)).toEqual([{ date: '2026-08-19', amount: 1 }])
  })

  it('increments an existing day without touching the others', () => {
    const entries = [
      { date: '2026-08-18', amount: 1 },
      { date: '2026-08-19', amount: 1 },
    ]

    expect(applyProgressDelta(entries, '2026-08-19', 2)).toEqual([
      { date: '2026-08-18', amount: 1 },
      { date: '2026-08-19', amount: 3 },
    ])
  })

  it('keeps entries sorted by date when inserting an older day', () => {
    const entries = [{ date: '2026-08-19', amount: 1 }]

    expect(applyProgressDelta(entries, '2026-08-17', 1)).toEqual([
      { date: '2026-08-17', amount: 1 },
      { date: '2026-08-19', amount: 1 },
    ])
  })

  it('drops the entry entirely when a day is decremented back to zero', () => {
    const entries = [{ date: '2026-08-19', amount: 1 }]

    expect(applyProgressDelta(entries, '2026-08-19', -1)).toEqual([])
  })

  it('never records negative progress', () => {
    const entries = [{ date: '2026-08-19', amount: 1 }]

    expect(applyProgressDelta(entries, '2026-08-19', -5)).toEqual([])
  })

  it('rejects a fractional delta', () => {
    expect(() => applyProgressDelta([], '2026-08-19', 0.5)).toThrow(BacklogValidationError)
  })

  it('rejects a malformed date key', () => {
    expect(() => applyProgressDelta([], '19/08/2026', 1)).toThrow(BacklogValidationError)
  })
})

describe('isPlausibleDailyGoal', () => {
  it('accepts a well-formed goal', () => {
    expect(isPlausibleDailyGoal({ amount: 1, unit: 'chapter' })).toBe(true)
  })

  it.each([
    ['a missing unit', { amount: 1 }],
    ['a non-numeric amount', { amount: '1', unit: 'chapter' }],
    ['a zero amount', { amount: 0, unit: 'chapter' }],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(isPlausibleDailyGoal(value)).toBe(false)
  })
})

describe('isPlausibleProgressEntry', () => {
  it('accepts a well-formed entry', () => {
    expect(isPlausibleProgressEntry({ date: '2026-08-19', amount: 2 })).toBe(true)
  })

  it.each([
    ['a malformed date', { date: 'yesterday', amount: 2 }],
    ['a negative amount', { date: '2026-08-19', amount: -1 }],
    ['a missing amount', { date: '2026-08-19' }],
  ])('rejects %s', (_label, value) => {
    expect(isPlausibleProgressEntry(value)).toBe(false)
  })
})

/*
 * A cadence arrives from a backup file, from another device, or from a
 * hand-edited blob, and `cadenceCovers` reads `days.includes(...)` — so
 * a record whose `days` is a string does not degrade, it throws, on a
 * screen somebody opened to read a book.
 */
describe('a goal carrying a cadence from somewhere untrusted', () => {
  const goal = (cadence: unknown) => ({ amount: 1, unit: 'chapter', cadence })

  it('accepts a goal with no cadence, which means every day', () => {
    expect(isPlausibleDailyGoal({ amount: 1, unit: 'chapter' })).toBe(true)
  })

  it('accepts the three real kinds', () => {
    expect(isPlausibleDailyGoal(goal({ kind: 'every-day' }))).toBe(true)
    expect(isPlausibleDailyGoal(goal({ kind: 'days-of-week', days: [0, 6] }))).toBe(true)
    expect(isPlausibleDailyGoal(goal({ kind: 'days-of-month', days: [1, 31] }))).toBe(true)
  })

  it('refuses days that are not an array', () => {
    expect(isPlausibleDailyGoal(goal({ kind: 'days-of-week', days: 'tuesday' }))).toBe(false)
  })

  it('refuses a kind it does not know', () => {
    expect(isPlausibleDailyGoal(goal({ kind: 'every-three-days', days: [] }))).toBe(false)
  })

  /*
   * Range-checked as well as typed, because `days-of-month: [0]` is
   * expected on no day of any month — a goal that is simply never due,
   * with nothing on any screen able to say why.
   */
  it('refuses day numbers outside the range their kind uses', () => {
    expect(isPlausibleDailyGoal(goal({ kind: 'days-of-week', days: [7] }))).toBe(false)
    expect(isPlausibleDailyGoal(goal({ kind: 'days-of-month', days: [0] }))).toBe(false)
    expect(isPlausibleDailyGoal(goal({ kind: 'days-of-month', days: [32] }))).toBe(false)
  })

  it('refuses a non-integer day', () => {
    expect(isPlausibleDailyGoal(goal({ kind: 'days-of-week', days: [1.5] }))).toBe(false)
  })
})
