import { describe, expect, it } from 'vitest'

import { asDailyId } from '@/domain/ids/ids'

import {
  bestStreakFor,
  complete,
  isDueToday,
  isExpectedOn,
  isDoneOn,
  streakFor,
  timesDoneOn,
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

describe('a habit done several times a day', () => {
  const dog = (over: Partial<Daily> = {}) =>
    aDaily({ cadence: { kind: 'every-day' }, timesPerDay: 3, ...over })

  const at = (hour: number) => new Date(Date.UTC(2026, 7, 27, hour))

  it('is not done until it has been done enough times', () => {
    let daily = dog()

    expect(isDoneOn(daily, '2026-08-27')).toBe(false)
    daily = complete(daily, '2026-08-27', at(8))
    expect(timesDoneOn(daily, '2026-08-27')).toBe(1)
    expect(isDoneOn(daily, '2026-08-27')).toBe(false)

    daily = complete(daily, '2026-08-27', at(13))
    daily = complete(daily, '2026-08-27', at(19))

    expect(timesDoneOn(daily, '2026-08-27')).toBe(3)
    expect(isDoneOn(daily, '2026-08-27')).toBe(true)
  })

  /*
   * The reason a set of day keys could not carry this: the evening feed
   * is not a duplicate of the morning one, so the two have to be
   * distinguishable or one of them is lost.
   */
  it('records each completion separately rather than collapsing them', () => {
    let daily = dog()
    daily = complete(daily, '2026-08-27', at(8))
    daily = complete(daily, '2026-08-27', at(19))

    expect(daily.done).toHaveLength(2)
  })

  it('does not record more than the day asked for', () => {
    let daily = dog()
    for (const hour of [8, 13, 19, 22]) daily = complete(daily, '2026-08-27', at(hour))

    expect(timesDoneOn(daily, '2026-08-27')).toBe(3)
  })

  /*
   * An undo, not an eraser. Mis-tapping the third feed must not throw
   * away the two that happened.
   */
  it('takes back one completion at a time', () => {
    let daily = dog()
    for (const hour of [8, 13, 19]) daily = complete(daily, '2026-08-27', at(hour))

    daily = uncomplete(daily, '2026-08-27')

    expect(timesDoneOn(daily, '2026-08-27')).toBe(2)
    expect(isDoneOn(daily, '2026-08-27')).toBe(false)
  })

  it('counts a day toward the streak only once it is fully done', () => {
    let daily = dog()
    // Yesterday complete, today two of three.
    for (const hour of [8, 13, 19]) daily = complete(daily, '2026-08-26', at(hour))
    daily = complete(daily, '2026-08-27', at(8))
    daily = complete(daily, '2026-08-27', at(13))

    // Today is unfinished and the day is not over, so it neither counts
    // nor breaks — the same humane rule a once-daily habit gets.
    expect(streakFor(daily, '2026-08-27')).toBe(1)
  })

  it('leaves a partly done yesterday out of the streak', () => {
    let daily = dog()
    daily = complete(daily, '2026-08-26', at(8))

    expect(streakFor(daily, '2026-08-27')).toBe(0)
  })
})

describe('records written before times-per-day existed', () => {
  /*
   * These are on a device now. A bare day key is read as one completion
   * because `timesDoneOn` compares only the day part, so nothing had to
   * be migrated.
   */
  it('reads a bare day key as one completion', () => {
    const old = aDaily({ done: ['2026-08-26', '2026-08-27'] })

    expect(timesDoneOn(old, '2026-08-27')).toBe(1)
    expect(isDoneOn(old, '2026-08-27')).toBe(true)
    expect(streakFor(old, '2026-08-27')).toBe(2)
  })

  /*
   * The idempotency that a once-a-day habit depends on: two devices
   * ticking the same Tuesday write the same string, so the union
   * collapses it and `daysKept` — which counts entries — pays once.
   */
  it('stays idempotent when it is only expected once', () => {
    const once = aDaily({ done: [] })
    const first = complete(once, '2026-08-27')
    const again = complete(first, '2026-08-27')

    expect(again.done).toEqual(['2026-08-27'])
    expect(again).toBe(first)
  })
})
