import { describe, expect, it } from 'vitest'

import { readCharges, spendCharge, undoLastCharge, type Vice } from './charges'
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
