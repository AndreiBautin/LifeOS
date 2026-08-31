import { describe, expect, it } from 'vitest'

import { complete, isDoneOn, timesDoneOn, uncomplete } from './daily'
import { toDayKey } from '../time/day'
import { asDailyId } from '../ids/ids'
import type { Daily } from './daily'

/**
 * An evening in New York is already tomorrow in UTC.
 *
 * 20:44 on the 30th of August is 00:44 on the 31st, Zulu — so a stamp
 * written with `toISOString()` carries a date that is not the day the
 * person was living in when they tapped the button.
 */
const EVENING = new Date('2026-08-31T00:44:00.000Z')

function feeding(done: readonly string[] = []): Daily {
  return {
    id: asDailyId('dog'),
    title: 'Feed the dog',
    cadence: { kind: 'every-day' },
    timesPerDay: 3,
    done,
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

describe('a completion logged in the evening, west of UTC', () => {
  it('is filed under the day the person was in, not the day UTC was in', () => {
    expect(toDayKey(EVENING)).toBe('2026-08-30')

    const after = complete(feeding(), toDayKey(EVENING), EVENING)
    const entry = after.done[0]

    /*
     * The load-bearing assertion. `timesDoneOn` counts by comparing the
     * first ten characters of an entry against a day key, so an entry
     * whose prefix is the UTC date is counted against a day the lifter
     * has not reached yet — and is therefore not counted at all today.
     */
    expect(entry?.slice(0, 10)).toBe('2026-08-30')
  })

  it('counts towards the day it was logged on', () => {
    const day = toDayKey(EVENING)
    const after = complete(feeding(), day, EVENING)

    expect(timesDoneOn(after, day)).toBe(1)
  })

  it('lets the third of three actually finish the day', () => {
    /*
     * The reported symptom exactly: two logged earlier in the day, the
     * third in the evening. It stuck at 2 of 3 while paying XP, because
     * the write succeeded and the count could not see it.
     */
    const day = toDayKey(EVENING)
    const morning = new Date('2026-08-30T13:00:00.000Z') // 09:00 in New York
    const afternoon = new Date('2026-08-30T19:00:00.000Z') // 15:00

    let daily = complete(feeding(), day, morning)
    daily = complete(daily, day, afternoon)
    expect(timesDoneOn(daily, day)).toBe(2)

    daily = complete(daily, day, EVENING)

    expect(timesDoneOn(daily, day)).toBe(3)
    expect(isDoneOn(daily, day)).toBe(true)
  })

  it('can be undone again, which needs the same prefix to match', () => {
    const day = toDayKey(EVENING)
    const daily = complete(feeding(), day, EVENING)

    expect(timesDoneOn(uncomplete(daily, day), day)).toBe(0)
  })

  it('still refuses a fourth once the quota is met', () => {
    const day = toDayKey(EVENING)
    let daily = feeding()
    for (const at of [
      new Date('2026-08-30T13:00:00.000Z'),
      new Date('2026-08-30T19:00:00.000Z'),
      EVENING,
    ]) {
      daily = complete(daily, day, at)
    }

    expect(complete(daily, day, new Date('2026-08-31T01:00:00.000Z'))).toBe(daily)
  })
})
