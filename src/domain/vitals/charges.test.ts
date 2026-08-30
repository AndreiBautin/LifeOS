import { describe, expect, it } from 'vitest'

import {
  cycleOf,
  describeCycle,
  readCharges,
  spendCharge,
  spendEntry,
  undoLastCharge,
  type Vice,
} from './charges'
import { asViceId } from '@/domain/ids/ids'

/**
 * The regeneration rule was chosen to survive a merge, so that is what
 * most of these are about.
 *
 * A pool that remembered when it last refilled would be device state
 * with no correct reconciliation — spend on the phone and on the laptop
 * while apart and there is no answer to which level is right. Deriving
 * the reading from the spend list alone is what makes two devices agree,
 * and the tests below are mostly the ways that could quietly stop being
 * true.
 */

const at = (iso: string) => new Date(iso)

const coffee = (spent: readonly string[]): Vice => ({
  id: asViceId('coffee'),
  name: 'Coffee',
  capacity: 3,
  regenHours: 12,
  spent,
  createdAt: '2026-01-01T00:00:00.000Z',
})

describe('reading a pool', () => {
  it('is full when nothing has been spent', () => {
    const reading = readCharges(coffee([]), at('2026-08-27T09:00:00.000Z'))

    expect(reading.available).toBe(3)
    expect(reading.over).toBe(0)
    // Nothing is coming back, so there is no time to show.
    expect(reading.nextBackAt).toBeUndefined()
  })

  it('counts down as charges are spent', () => {
    const reading = readCharges(
      coffee(['2026-08-27T07:00:00.000Z', '2026-08-27T08:00:00.000Z']),
      at('2026-08-27T09:00:00.000Z'),
    )

    expect(reading.available).toBe(1)
    expect(reading.onCooldown).toBe(2)
  })

  /*
   * The rule, stated as the case that distinguishes it from a token
   * bucket: three spent at once come back at once. A bucket would return
   * them one at a time and would need to remember when it started.
   */
  it('brings a charge back exactly one cooldown after the spend that took it', () => {
    const morning = [
      '2026-08-27T08:00:00.000Z',
      '2026-08-27T08:00:00.000Z',
      '2026-08-27T08:00:00.000Z',
    ]

    expect(readCharges(coffee(morning), at('2026-08-27T19:59:00.000Z')).available).toBe(0)
    expect(readCharges(coffee(morning), at('2026-08-27T20:01:00.000Z')).available).toBe(3)
  })

  it('says when the next charge is due back', () => {
    const reading = readCharges(
      coffee(['2026-08-27T07:00:00.000Z', '2026-08-27T09:00:00.000Z']),
      at('2026-08-27T10:00:00.000Z'),
    )

    // The oldest spend inside the window is the next to expire.
    expect(reading.nextBackAt?.toISOString()).toBe('2026-08-27T19:00:00.000Z')
  })

  it('forgets spends older than the cooldown entirely', () => {
    const reading = readCharges(
      coffee(['2026-08-20T08:00:00.000Z']),
      at('2026-08-27T08:00:00.000Z'),
    )

    expect(reading.available).toBe(3)
  })
})

describe('going past the allowance', () => {
  /*
   * A spend is never refused, so the fourth coffee has to land somewhere.
   * Clamping the bar at empty is right; clamping the record at empty
   * would make the one day worth noticing look exactly like a day at the
   * limit.
   */
  it('reports the overrun rather than hiding it at empty', () => {
    const reading = readCharges(
      coffee([
        '2026-08-27T06:00:00.000Z',
        '2026-08-27T07:00:00.000Z',
        '2026-08-27T08:00:00.000Z',
        '2026-08-27T09:00:00.000Z',
      ]),
      at('2026-08-27T10:00:00.000Z'),
    )

    expect(reading.available).toBe(0)
    expect(reading.over).toBe(1)
    expect(reading.onCooldown).toBe(4)
  })

  it('still says when the overrun next shrinks', () => {
    const reading = readCharges(
      coffee([
        '2026-08-27T06:00:00.000Z',
        '2026-08-27T07:00:00.000Z',
        '2026-08-27T08:00:00.000Z',
        '2026-08-27T09:00:00.000Z',
      ]),
      at('2026-08-27T10:00:00.000Z'),
    )

    expect(reading.nextBackAt?.toISOString()).toBe('2026-08-27T18:00:00.000Z')
  })
})

describe('spending and undoing', () => {
  it('records a spend rather than refusing one', () => {
    const empty = coffee([
      '2026-08-27T06:00:00.000Z',
      '2026-08-27T07:00:00.000Z',
      '2026-08-27T08:00:00.000Z',
    ])

    expect(spendCharge(empty, at('2026-08-27T09:00:00.000Z')).spent).toHaveLength(4)
  })

  it('undoes the latest spend and only the latest', () => {
    const vice = coffee(['2026-08-27T06:00:00.000Z', '2026-08-27T08:00:00.000Z'])

    expect(undoLastCharge(vice).spent).toEqual(['2026-08-27T06:00:00.000Z'])
  })

  /*
   * An undo, not an editor. Reaching back to delete an inconvenient
   * Friday would make this a record you curate, and it is the one place
   * in the app whose value depends entirely on not doing that — so the
   * latest is removed regardless of the order the list happens to be in.
   */
  it('removes the latest by time, not by position in the list', () => {
    const vice = coffee(['2026-08-27T08:00:00.000Z', '2026-08-27T06:00:00.000Z'])

    expect(undoLastCharge(vice).spent).toEqual(['2026-08-27T06:00:00.000Z'])
  })

  it('has nothing to undo on an untouched pool', () => {
    expect(undoLastCharge(coffee([])).spent).toEqual([])
  })
})

describe('the reading depends on the spends and the clock alone', () => {
  /*
   * The property the merge rests on. Two devices that have seen the same
   * spends must agree whatever order those arrived in, so the reading
   * cannot depend on the order of the list.
   */
  it('does not depend on the order the spends arrived in', () => {
    const stamps = [
      '2026-08-27T09:00:00.000Z',
      '2026-08-27T06:00:00.000Z',
      '2026-08-27T08:00:00.000Z',
    ]
    const now = at('2026-08-27T10:00:00.000Z')

    expect(readCharges(coffee([...stamps].reverse()), now)).toEqual(
      readCharges(coffee(stamps), now),
    )
  })

  /*
   * This one counts *entries*, not distinct moments — so two identical
   * stamps are two spends. That is deliberate and it is load-bearing in
   * the other direction: it is exactly why the sync merge for `spent`
   * has to be a **union over the string** rather than a concatenation.
   * A record-level merge that appended both copies of the same stamp
   * would silently consume a charge that was never drunk.
   *
   * `payload.test.ts` holds the union half. This is the half that says
   * why it matters.
   */
  it('counts each stamp it is given, which is what the union merge protects', () => {
    const twice = ['2026-08-27T08:00:00.000Z', '2026-08-27T08:00:00.000Z']
    const now = at('2026-08-27T10:00:00.000Z')

    expect(readCharges(coffee(twice), now).available).toBe(1)
    expect(readCharges(coffee([...new Set(twice)]), now).available).toBe(2)
  })

  it('ignores a stamp it cannot parse rather than counting it', () => {
    // A malformed row must not silently consume a charge forever.
    expect(readCharges(coffee(['not-a-date']), at('2026-08-27T10:00:00.000Z')).available).toBe(3)
  })
})

describe('a calendar cycle', () => {
  const beer = (spent: readonly string[]): Vice => ({
    id: asViceId('beer'),
    name: 'Beer',
    capacity: 4,
    cycle: { kind: 'calendar', period: 'week' },
    spent,
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  // A Thursday, so the Monday boundary is three days behind it.
  const thursday = new Date(2026, 7, 27, 19, 0)

  it('counts what has been spent since the period began', () => {
    const reading = readCharges(
      beer([
        new Date(2026, 7, 25, 20, 0).toISOString(), // Tuesday
        new Date(2026, 7, 26, 21, 0).toISOString(), // Wednesday
      ]),
      thursday,
    )

    expect(reading.available).toBe(2)
  })

  /*
   * The whole point of the calendar shape: last week's drinking is not
   * on this week's allowance, however recently it happened. Under a
   * rolling window a Sunday-night beer would still be counted on Monday
   * morning, which is the thing that made hours read as nonsense here.
   */
  it('ignores spends from the period before, however recent', () => {
    const sundayNight = new Date(2026, 7, 23, 23, 30).toISOString()
    const mondayMorning = new Date(2026, 7, 24, 9, 0)

    expect(readCharges(beer([sundayNight]), mondayMorning).available).toBe(4)
  })

  /*
   * The load-bearing reason the week starts on Monday: a weekly drink
   * allowance has to hold the weekend together. On a Sunday-start week a
   * Saturday beer and a Sunday beer fall in different weeks.
   */
  it('keeps Friday, Saturday and Sunday on one allowance', () => {
    const spends = [
      new Date(2026, 7, 28, 20, 0).toISOString(), // Friday
      new Date(2026, 7, 29, 20, 0).toISOString(), // Saturday
      new Date(2026, 7, 30, 20, 0).toISOString(), // Sunday
    ]

    // Read on the Sunday night, after all three.
    expect(readCharges(beer(spends), new Date(2026, 7, 30, 23, 0)).available).toBe(1)
  })

  it('names the reset rather than a single charge returning', () => {
    const reading = readCharges(
      beer([
        new Date(2026, 7, 25, 20, 0).toISOString(),
        new Date(2026, 7, 25, 21, 0).toISOString(),
        new Date(2026, 7, 25, 22, 0).toISOString(),
        new Date(2026, 7, 26, 20, 0).toISOString(),
      ]),
      thursday,
    )

    expect(reading.available).toBe(0)
    // The following Monday, when the whole pool returns at once.
    expect(reading.nextBackAt?.getDay()).toBe(1)
    expect(reading.nextBackAt?.getDate()).toBe(31)
  })

  it('still records going over, and clears it at the boundary', () => {
    const five = Array.from({ length: 5 }, (_, i) => new Date(2026, 7, 25, 18 + i, 0).toISOString())

    expect(readCharges(beer(five), thursday).over).toBe(1)
    // Next Monday: the overrun is last week's, not this week's.
    expect(readCharges(beer(five), new Date(2026, 7, 31, 9, 0)).over).toBe(0)
  })

  it('resets a daily pool at local midnight', () => {
    const daily: Vice = { ...beer([]), capacity: 1, cycle: { kind: 'calendar', period: 'day' } }
    const lastNight = new Date(2026, 7, 26, 23, 0).toISOString()

    expect(
      readCharges({ ...daily, spent: [lastNight] }, new Date(2026, 7, 26, 23, 30)).available,
    ).toBe(0)
    expect(
      readCharges({ ...daily, spent: [lastNight] }, new Date(2026, 7, 27, 0, 30)).available,
    ).toBe(1)
  })
})

describe('pools written before cycles existed', () => {
  /*
   * These are on a device right now. `cycleOf` is the one place that
   * knows both shapes, and nothing migrates them — a stored `regenHours`
   * is already a complete statement of a rolling window.
   */
  it('reads a stored regenHours as the rolling window it always was', () => {
    const old: Vice = {
      id: asViceId('coffee'),
      name: 'Coffee',
      capacity: 2,
      regenHours: 12,
      spent: ['2026-08-27T08:00:00.000Z'],
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    expect(cycleOf(old)).toEqual({ kind: 'rolling', hours: 12 })
    expect(readCharges(old, new Date('2026-08-27T10:00:00.000Z')).available).toBe(1)
    expect(readCharges(old, new Date('2026-08-27T21:00:00.000Z')).available).toBe(2)
  })

  it('prefers the cycle when a record carries both', () => {
    // Not a shape this writes, but one a merge could produce.
    const both: Vice = {
      id: asViceId('beer'),
      name: 'Beer',
      capacity: 4,
      regenHours: 42,
      cycle: { kind: 'calendar', period: 'week' },
      spent: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    expect(cycleOf(both).kind).toBe('calendar')
  })
})

describe('a pool measured in units rather than counts', () => {
  const caffeine = (spent: readonly string[]): Vice => ({
    id: asViceId('caffeine'),
    name: 'Caffeine',
    capacity: 400,
    unit: 'mg',
    cycle: { kind: 'calendar', period: 'day' },
    spent,
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  const noon = new Date(2026, 7, 30, 12, 0)
  const morning = (mg: number) => spendEntry(new Date(2026, 7, 30, 8, 0), mg)

  it('sums the amounts rather than counting the entries', () => {
    const reading = readCharges(
      caffeine([morning(95), spendEntry(new Date(2026, 7, 30, 10), 65)]),
      noon,
    )

    expect(reading.onCooldown).toBe(160)
    expect(reading.available).toBe(240)
  })

  /*
   * The distinction the whole unit business exists for: a double
   * espresso and a cold brew are one coffee each and very different
   * amounts of caffeine.
   */
  it('treats two entries of different sizes differently', () => {
    const small = readCharges(caffeine([morning(65)]), noon).available
    const large = readCharges(caffeine([morning(200)]), noon).available

    expect(small).toBeGreaterThan(large)
  })

  it('still reports going over a limit', () => {
    const reading = readCharges(
      caffeine([morning(300), spendEntry(new Date(2026, 7, 30, 10), 200)]),
      noon,
    )

    expect(reading.available).toBe(0)
    expect(reading.over).toBe(100)
  })

  /*
   * A target is filled rather than spent, so exceeding it is not an
   * overrun — reporting "500 over" for drinking enough water would be
   * scolding somebody for doing the thing.
   */
  it('never reports an overrun on a target', () => {
    const water: Vice = {
      ...caffeine([]),
      name: 'Water',
      capacity: 3000,
      unit: 'ml',
      direction: 'target',
      spent: [spendEntry(new Date(2026, 7, 30, 8), 3500)],
    }

    const reading = readCharges(water, noon)

    expect(reading.onCooldown).toBe(3500)
    expect(reading.over).toBe(0)
  })

  it('ignores an amount it cannot read rather than counting it as one', () => {
    // A malformed entry must not quietly make the pool look fuller.
    const reading = readCharges(
      caffeine([`${new Date(2026, 7, 30, 8).toISOString()}#nonsense`]),
      noon,
    )

    expect(reading.onCooldown).toBe(0)
  })

  it('says the unit when it describes the limit', () => {
    expect(describeCycle(caffeine([]))).toBe('400 mg a day')
  })
})

describe('entries written before amounts existed', () => {
  /*
   * Every entry on a device right now is a bare timestamp. It reads as
   * one, which is what it always meant, so nothing needed migrating.
   */
  it('reads a bare timestamp as one', () => {
    const beer: Vice = {
      id: asViceId('beer'),
      name: 'Beer',
      capacity: 4,
      cycle: { kind: 'calendar', period: 'week' },
      spent: [new Date(2026, 7, 25, 20).toISOString(), new Date(2026, 7, 26, 20).toISOString()],
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    expect(readCharges(beer, new Date(2026, 7, 27, 12)).available).toBe(2)
  })

  it('writes a bare timestamp when the amount is one', () => {
    // So a counting pool's entries stay byte-identical to what they were,
    // and two devices logging the same tap still collapse to one.
    const at = new Date(2026, 7, 30, 8)

    expect(spendEntry(at)).toBe(at.toISOString())
    expect(spendEntry(at, 1)).toBe(at.toISOString())
    expect(spendEntry(at, 95)).toContain('#95')
  })
})

describe('limiting the days as well as the amount', () => {
  // Three a day, on at most two days a week.
  const drink = (spent: readonly string[]): Vice => ({
    id: asViceId('alcohol'),
    name: 'Alcohol',
    capacity: 3,
    cycle: { kind: 'calendar', period: 'day' },
    daysLimit: { days: 2, period: 'week' },
    spent,
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  // The week beginning Monday 24 August 2026.
  const on = (day: number, hour = 20) => spendEntry(new Date(2026, 7, day, hour))

  it('counts drinking days, not drinks', () => {
    // Three on one Tuesday is one day used, not three.
    const reading = readCharges(
      drink([on(25, 18), on(25, 19), on(25, 20)]),
      new Date(2026, 7, 25, 22),
    )

    expect(reading.days?.used).toBe(1)
    expect(reading.days?.allowed).toBe(2)
  })

  /*
   * The case that makes it usable rather than annoying: a day already
   * started does not cost a second one, so the third drink on a Friday
   * you had already begun is not "breaking the limit".
   */
  it('does not charge a second day for a day already started', () => {
    const reading = readCharges(drink([on(25), on(26)]), new Date(2026, 7, 26, 22))

    expect(reading.days?.used).toBe(2)
    expect(reading.days?.todayCounts).toBe(true)
    // One of three drunk *today* — the other was yesterday, and the
    // amount runs on its own daily cycle — so two are still available.
    expect(reading.available).toBe(2)
  })

  /*
   * And the point of the whole thing: out of days shuts the pool on a
   * new day, even though that day's own amount is untouched.
   */
  it('shuts on a new day once the days are spent', () => {
    const reading = readCharges(drink([on(25), on(26)]), new Date(2026, 7, 27, 20))

    expect(reading.days?.todayCounts).toBe(false)
    expect(reading.available).toBe(0)
  })

  it('opens again when the period turns over', () => {
    // The following Monday: last week's days are last week's.
    const reading = readCharges(drink([on(25), on(26)]), new Date(2026, 7, 31, 20))

    expect(reading.days?.used).toBe(0)
    expect(reading.available).toBe(3)
  })

  it('still limits the amount on a day that is allowed', () => {
    const reading = readCharges(
      drink([on(25, 18), on(25, 19), on(25, 20)]),
      new Date(2026, 7, 25, 22),
    )

    expect(reading.available).toBe(0)
    expect(reading.days?.todayCounts).toBe(true)
  })

  it('says both halves in a sentence', () => {
    expect(describeCycle(drink([]))).toBe('3 a day, on 2 days a week')
  })

  it('says nothing about days when a pool has no such limit', () => {
    const plain: Vice = { ...drink([]), capacity: 4 }
    delete (plain as { daysLimit?: unknown }).daysLimit

    expect(readCharges(plain, new Date(2026, 7, 27, 20)).days).toBeUndefined()
  })
})
