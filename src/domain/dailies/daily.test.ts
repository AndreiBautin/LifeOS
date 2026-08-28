import { describe, expect, it } from 'vitest'

import { asDailyId } from '@/domain/ids/ids'

import {
  bestStreakFor,
  complete,
  isDueToday,
  isExpectedOn,
  streakFor,
  uncomplete,
  type Cadence,
  type Daily,
} from './daily'

/**
 * The streak is the only pressure in this design, which makes it the only
 * thing here worth testing hard. Two rules keep it humane, and both are
 * the sort a `length` would get wrong.
 */
function aDaily(over: Partial<Daily> = {}): Daily {
  return {
    id: asDailyId('d1'),
    title: 'Stretch',
    cadence: { kind: 'every-day' },
    done: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const WEEKDAYS: Cadence = { kind: 'days-of-week', days: [1, 2, 3, 4, 5] }

describe('a streak counting back', () => {
  it('counts consecutive days', () => {
    const daily = aDaily({ done: ['2026-08-25', '2026-08-26', '2026-08-27'] })

    expect(streakFor(daily, '2026-08-27')).toBe(3)
  })

  it('stops at the first missed day', () => {
    const daily = aDaily({ done: ['2026-08-24', '2026-08-26', '2026-08-27'] })

    expect(streakFor(daily, '2026-08-27')).toBe(2)
  })

  /*
   * The rule that decides whether this is encouraging or punishing.
   * Opening the app on Tuesday morning to be told a twelve-day streak is
   * over — because you have not yet done the thing you are about to do —
   * is the most discouraging thing a habit tracker can do, and the one it
   * does most often.
   */
  it('does not break because today is not done yet', () => {
    const daily = aDaily({ done: ['2026-08-25', '2026-08-26'] })

    expect(streakFor(daily, '2026-08-27')).toBe(2)
  })

  it('does break because yesterday was missed', () => {
    const daily = aDaily({ done: ['2026-08-24', '2026-08-25'] })

    expect(streakFor(daily, '2026-08-27')).toBe(0)
  })

  it('is nothing when nothing was ever done', () => {
    expect(streakFor(aDaily(), '2026-08-27')).toBe(0)
  })
})

describe('a streak on a cadence that is not every day', () => {
  /*
   * The second humane rule: a weekday habit is not broken by Sunday.
   * Without it every cadence but every-day reads as a streak of one
   * forever, which is worse than showing no streak at all.
   */
  it('is not broken by a day it was never expected on', () => {
    // 2026-08-27 is a Thursday. The weekend before is the 22nd and 23rd.
    const daily = aDaily({
      cadence: WEEKDAYS,
      done: ['2026-08-20', '2026-08-21', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27'],
    })

    // Six weekdays, with a weekend skipped rather than counted or broken.
    expect(streakFor(daily, '2026-08-27')).toBe(6)
  })

  it('knows which days it is expected on', () => {
    const daily = aDaily({ cadence: WEEKDAYS })

    expect(isExpectedOn(daily, '2026-08-27')).toBe(true) // Thursday
    expect(isExpectedOn(daily, '2026-08-29')).toBe(false) // Saturday
  })

  it('counts a weekly habit that has never missed', () => {
    // Mondays only.
    const daily = aDaily({
      cadence: { kind: 'days-of-week', days: [1] },
      done: ['2026-08-10', '2026-08-17', '2026-08-24'],
    })

    expect(streakFor(daily, '2026-08-27')).toBe(3)
  })
})

describe('retiring rather than deleting', () => {
  /*
   * Retiring keeps the days it was done on, which is the point: deleting
   * a habit you kept for eighty days should not be the only way to stop
   * being asked about it.
   */
  it('is expected on nothing once retired', () => {
    const daily = aDaily({ retiredAt: '2026-08-20' })

    expect(isExpectedOn(daily, '2026-08-27')).toBe(false)
    expect(isDueToday(daily, '2026-08-27')).toBe(false)
  })

  it('was still expected before it was retired', () => {
    const daily = aDaily({ retiredAt: '2026-08-20' })

    expect(isExpectedOn(daily, '2026-08-19')).toBe(true)
  })
})

describe('ticking a day', () => {
  /*
   * Idempotent by identity, so a caller can skip the write — and so two
   * devices that both ticked Tuesday converge instead of disagreeing
   * about how many Tuesdays there were.
   */
  it('returns the same object when the day is already ticked', () => {
    const daily = aDaily({ done: ['2026-08-27'] })

    expect(complete(daily, '2026-08-27')).toBe(daily)
  })

  it('adds a day and keeps the list sorted', () => {
    const daily = complete(aDaily({ done: ['2026-08-27'] }), '2026-08-25')

    expect(daily.done).toEqual(['2026-08-25', '2026-08-27'])
  })

  it('unticks, and is a no-op when there was nothing to untick', () => {
    const daily = aDaily({ done: ['2026-08-27'] })

    expect(uncomplete(daily, '2026-08-27').done).toEqual([])
    expect(uncomplete(daily, '2026-08-01')).toBe(daily)
  })
})

describe('the best run ever', () => {
  it('finds a longer past run than the current one', () => {
    const daily = aDaily({
      done: [
        '2026-07-01',
        '2026-07-02',
        '2026-07-03',
        '2026-07-04',
        // gap
        '2026-08-26',
        '2026-08-27',
      ],
    })

    expect(bestStreakFor(daily)).toBe(4)
    expect(streakFor(daily, '2026-08-27')).toBe(2)
  })

  it('is nothing when nothing was done', () => {
    expect(bestStreakFor(aDaily())).toBe(0)
  })
})

describe('what is due', () => {
  it('is due when expected and not yet ticked', () => {
    expect(isDueToday(aDaily(), '2026-08-27')).toBe(true)
  })

  it('is not due once ticked', () => {
    expect(isDueToday(aDaily({ done: ['2026-08-27'] }), '2026-08-27')).toBe(false)
  })

  it('is not due on a day it is not expected', () => {
    expect(isDueToday(aDaily({ cadence: WEEKDAYS }), '2026-08-29')).toBe(false)
  })
})

/**
 * Monthly, without the flaw that kept "every N days" out.
 *
 * Every cadence here answers one question — given a date, was this
 * expected on it? — and that is what lets a streak be a walk backwards, a
 * day at a time. `days-of-month` keeps the property: it reads the date
 * and nothing else.
 */
describe('a monthly cadence', () => {
  const monthly = (days: readonly number[]): Daily => ({
    id: asDailyId('chore'),
    title: 'Deep clean',
    cadence: { kind: 'days-of-month', days },
    done: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  it('is expected on its day of the month and no other', () => {
    const first = monthly([1])

    expect(isExpectedOn(first, '2026-03-01')).toBe(true)
    expect(isExpectedOn(first, '2026-04-01')).toBe(true)
    expect(isExpectedOn(first, '2026-03-02')).toBe(false)
    expect(isExpectedOn(first, '2026-03-31')).toBe(false)
  })

  it('takes more than one day a month', () => {
    const twice = monthly([1, 15])

    expect(isExpectedOn(twice, '2026-03-01')).toBe(true)
    expect(isExpectedOn(twice, '2026-03-15')).toBe(true)
    expect(isExpectedOn(twice, '2026-03-08')).toBe(false)
  })

  /*
   * The deliberate edge. Sliding the 31st to the 28th in February would
   * make "was this expected on the 28th" depend on which month the 28th
   * was in, and the streak walk would have to know about month lengths to
   * stay correct. Skipping keeps the cadence a property of the date.
   */
  it('skips a month too short to contain its day rather than sliding it', () => {
    const late = monthly([31])

    expect(isExpectedOn(late, '2026-01-31')).toBe(true)
    expect(isExpectedOn(late, '2026-02-28')).toBe(false)
    expect(isExpectedOn(late, '2026-04-30')).toBe(false)
  })

  /*
   * And the streak still walks. A day the chore was not expected on does
   * not break it, which is what makes a monthly run of three months read
   * as three rather than as one.
   */
  it('counts a run of months as a streak', () => {
    const kept: Daily = {
      ...monthly([1]),
      done: ['2026-01-01', '2026-02-01', '2026-03-01'],
    }

    expect(streakFor(kept, '2026-03-15')).toBe(3)
  })
})
