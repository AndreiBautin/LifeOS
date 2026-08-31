import { describe, expect, it } from 'vitest'

import { asRoomId } from '@/domain/ids/ids'

import {
  asClear,
  asOf,
  describeClear,
  houseStanding,
  latest,
  record,
  standingFor,
  type Room,
} from './declutter'

function room(name: string, readings: readonly [string, number][] = []): Room {
  return {
    id: asRoomId(name),
    name,
    readings: readings.map(([day, clear]) => ({ day, clear })),
    createdAt: '2026-08-01T09:00:00',
  }
}

describe('recording how clear a room is', () => {
  it('keeps readings in day order', () => {
    let kitchen = room('Kitchen')
    kitchen = record(kitchen, '2026-08-20', 40)
    kitchen = record(kitchen, '2026-08-10', 20)

    expect(kitchen.readings.map((one) => one.day)).toEqual(['2026-08-10', '2026-08-20'])
  })

  /*
   * Two readings for one Tuesday are two opinions about one fact, which
   * is the rule weigh-ins already follow. A second look at the same room
   * on the same day is a correction, not a second measurement.
   */
  it('replaces a day rather than appending to it', () => {
    let kitchen = room('Kitchen', [['2026-08-20', 40]])
    kitchen = record(kitchen, '2026-08-20', 65)

    expect(kitchen.readings).toEqual([{ day: '2026-08-20', clear: 65 }])
  })

  it('clamps and rounds, because nothing stores a half', () => {
    expect(asClear(62.4)).toBe(62)
    expect(asClear(140)).toBe(100)
    expect(asClear(-10)).toBe(0)
    expect(asClear(Number.NaN)).toBe(0)
  })
})

describe('reading a room back', () => {
  const kitchen = room('Kitchen', [
    ['2026-08-01', 30],
    ['2026-08-15', 55],
    ['2026-08-29', 80],
  ])

  it('gives the most recent reading', () => {
    expect(latest(kitchen)?.clear).toBe(80)
  })

  /*
   * Nothing is carried forward into a gap and nothing is interpolated. A
   * room unread for a fortnight has no reading for last Tuesday; what it
   * has is the last thing anybody actually said about it.
   */
  it('takes the reading in force on a day, never one between two', () => {
    expect(asOf(kitchen, '2026-08-20')?.clear).toBe(55)
    expect(asOf(kitchen, '2026-08-15')?.clear).toBe(55)
  })

  it('says nothing about a day before anything was read', () => {
    expect(asOf(kitchen, '2026-07-01')).toBeUndefined()
    expect(latest(room('Empty'))).toBeUndefined()
  })
})

describe('how a room stands', () => {
  it('reports the level and how far it has moved', () => {
    const standing = standingFor(
      room('Kitchen', [
        ['2026-08-01', 30],
        ['2026-08-29', 80],
      ]),
      '2026-08-01',
    )

    expect(standing.clear).toBe(80)
    expect(standing.change).toBe(50)
  })

  /*
   * It goes backwards, and that is the point of tracking it: a room
   * cleared in March fills up again by August, and a model that only
   * counted progress would make the one thing worth knowing invisible.
   */
  it('reports going backwards as readily as forwards', () => {
    const standing = standingFor(
      room('Garage', [
        ['2026-03-01', 90],
        ['2026-08-29', 40],
      ]),
      '2026-03-01',
    )

    expect(standing.change).toBe(-50)
  })

  /*
   * Absent rather than zero. A room read once has not "stayed the same"
   * — it has been read once, and a change of 0 would claim a stability
   * nobody observed.
   */
  it('has no change when there is nothing to compare against', () => {
    const once = standingFor(room('Loft', [['2026-08-29', 40]]), '2026-08-01')

    expect(once.clear).toBe(40)
    expect(once.change).toBeUndefined()
  })

  it('does not compare the only reading with itself', () => {
    const same = standingFor(room('Loft', [['2026-08-29', 40]]), '2026-08-29')

    expect(same.change).toBeUndefined()
  })

  it('says nothing at all about a room never read', () => {
    const never = standingFor(room('Shed'), '2026-08-01')

    expect(never.clear).toBeUndefined()
    expect(never.lastReadOn).toBeUndefined()
  })
})

describe('the house overall', () => {
  it('averages the rooms that have a reading', () => {
    const house = houseStanding(
      [room('A', [['2026-08-29', 80]]), room('B', [['2026-08-29', 40]])],
      '2026-08-01',
    )

    expect(house.clear).toBe(60)
  })

  /*
   * An unmeasured room is not a room full of clutter. Counting it as
   * zero would make adding a room you have not looked at yet read as the
   * house getting worse.
   */
  it('leaves an unread room out rather than counting it as nothing', () => {
    const house = houseStanding(
      [room('A', [['2026-08-29', 80]]), room('Never looked', [])],
      '2026-08-01',
    )

    expect(house.clear).toBe(80)
    expect(house.unread.map((one) => one.name)).toEqual(['Never looked'])
  })

  /*
   * Averaged over the rooms that *have* a comparison. A room read for
   * the first time this week has not held steady, and folding a zero in
   * would dilute a real change with a non-observation.
   */
  it('averages the change over rooms that can be compared', () => {
    const house = houseStanding(
      [
        room('Moved', [
          ['2026-08-01', 20],
          ['2026-08-29', 60],
        ]),
        room('New', [['2026-08-29', 90]]),
      ],
      '2026-08-01',
    )

    expect(house.change).toBe(40)
  })

  it('says nothing about a house nobody has read', () => {
    const house = houseStanding([room('A'), room('B')], '2026-08-01')

    expect(house.clear).toBeUndefined()
    expect(house.change).toBeUndefined()
    expect(house.unread).toHaveLength(2)
  })

  it('says nothing about no rooms at all', () => {
    expect(houseStanding([], '2026-08-01').clear).toBeUndefined()
  })
})

describe('putting a level into words', () => {
  /*
   * Five bands rather than a number alone, because "62%" is precision
   * nobody has — this is somebody looking round a room and judging.
   */
  it('covers the range without a gap', () => {
    for (let clear = 0; clear <= 100; clear += 1) {
      expect(describeClear(clear).length).toBeGreaterThan(0)
    }
  })

  it('reads the ends the way somebody would say them', () => {
    expect(describeClear(100)).toBe('Clear')
    expect(describeClear(0)).toBe('Overwhelmed')
  })
})

/*
 * Found by driving it. A garage read at 90 on the 5th and 32 on the 31st
 * has obviously got worse over that month — and comparing only against
 * readings *before* the window reported no change at all, because the
 * room had no reading on the 1st. The feature was useless in exactly the
 * case it exists for.
 */
describe('comparing when the history starts inside the window', () => {
  const garage = room('Garage', [
    ['2026-08-05', 90],
    ['2026-08-31', 32],
  ])

  it('compares against the first reading taken inside it', () => {
    expect(standingFor(garage, '2026-08-01').change).toBe(-58)
  })

  /*
   * A reading in force when the window opened still wins, because that
   * genuinely is where the room stood when it started.
   */
  it('prefers the reading in force when the window opened', () => {
    const withEarlier = room('Garage', [
      ['2026-07-20', 50],
      ['2026-08-05', 90],
      ['2026-08-31', 32],
    ])

    expect(standingFor(withEarlier, '2026-08-01').change).toBe(-18)
  })

  it('still has nothing to say about a room read only once', () => {
    expect(standingFor(room('Loft', [['2026-08-20', 40]]), '2026-08-01').change).toBeUndefined()
  })

  it('rolls up into the house the same way', () => {
    const house = houseStanding([garage, room('Kitchen', [['2026-08-31', 80]])], '2026-08-01')

    // Only the garage can be compared, so only the garage is averaged.
    expect(house.change).toBe(-58)
    expect(house.clear).toBe(56)
  })
})
