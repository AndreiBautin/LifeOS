import { describe, expect, it } from 'vitest'

import type { ViceId } from '@/domain/ids/ids'

import { spendEntry, type Vice } from './charges'
import { vitality } from './vitality'

const NOW = new Date(2026, 8, 10, 12, 0)

/** A spend at midday on a day offset back from NOW. */
function on(daysBack: number, amount = 1): string {
  const at = new Date(NOW)
  at.setDate(at.getDate() - daysBack)
  at.setHours(12, 0, 0, 0)
  return spendEntry(at, amount)
}

function pool(overrides: Partial<Vice> = {}): Vice {
  return {
    id: 'p' as ViceId,
    name: 'Water',
    capacity: 2,
    direction: 'target',
    cycle: { kind: 'calendar', period: 'day' },
    spent: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('vitality', () => {
  /*
   * Absent, never zero. With nothing to hit, the value could only ever
   * be nought — and a health bar pinned at empty reads as dying rather
   * than as unmeasured.
   */
  it('is absent when there is no daily target to judge', () => {
    const reading = vitality([pool({ direction: 'limit' })], NOW)

    expect(reading.value).toBeUndefined()
    expect(reading.possible).toBe(0)
  })

  it('is full when every day of the window hit its target', () => {
    const spent = Array.from({ length: 7 }, (_, back) => [on(back), on(back)]).flat()

    expect(vitality([pool({ spent })], NOW).value).toBe(1)
  })

  it('is empty when nothing was hit at all', () => {
    expect(vitality([pool()], NOW).value).toBe(0)
  })

  /*
   * The drain that needs no timer: a day that was hit ages out of the
   * window, so stopping makes the bar fall without anything ticking.
   */
  it('falls as a good day ages out of the window', () => {
    const spent = [on(0), on(0), on(1), on(1)]
    const reading = vitality([pool({ spent })], NOW)

    // Two of seven days hit.
    expect(reading.met).toBe(2)
    expect(reading.value).toBeCloseTo(2 / 7)
  })

  it('does not count a day that fell short of the target', () => {
    // Capacity is 2 and only one was logged.
    expect(vitality([pool({ spent: [on(0)] })], NOW).met).toBe(0)
  })

  /*
   * The whole point of the limits half: going over cancels a day of
   * having hit something, so a bad week drains faster than an idle one.
   */
  it('cancels a hit day for each day a limit stood over', () => {
    const target = pool({ spent: [on(0), on(0), on(1), on(1)] })
    const limit = pool({
      id: 'l' as ViceId,
      name: 'Caffeine',
      direction: 'limit',
      capacity: 1,
      spent: [on(0), on(0)],
    })

    const withoutLimit = vitality([target], NOW)
    const withLimit = vitality([target, limit], NOW)

    expect(withoutLimit.met).toBe(2)
    expect(withLimit.over).toBeGreaterThan(0)
    expect(withLimit.value ?? 0).toBeLessThan(withoutLimit.value ?? 0)
  })

  /*
   * No debt carried forward. A terrible week cannot take the bar below
   * empty and make the next one start in a hole.
   */
  it('never goes below empty however bad the week was', () => {
    const target = pool()
    const limit = pool({
      id: 'l' as ViceId,
      direction: 'limit',
      capacity: 1,
      spent: Array.from({ length: 7 }, (_, back) => [on(back), on(back), on(back)]).flat(),
    })

    expect(vitality([target, limit], NOW).value).toBe(0)
  })

  /*
   * A weekly target is left out of the denominator rather than counted
   * as missed every day — being unmeasurable is not being failed.
   */
  it('ignores a target that is not a daily one', () => {
    const weekly = pool({ cycle: { kind: 'calendar', period: 'week' } })

    expect(vitality([weekly], NOW).possible).toBe(0)
  })

  it('ignores a retired pool', () => {
    const retired = pool({ retiredAt: '2026-01-01T00:00:00.000Z' })

    expect(vitality([retired], NOW).possible).toBe(0)
  })
})

/**
 * The first-run reading, which was wrong until it was looked at.
 *
 * Three rations set up and all three hit on the first afternoon read as
 * **14% in red** — six of the seven days counted against pools that did
 * not exist yet. A bar calling a perfect day a failure is worse than no
 * bar.
 */
describe('a pool younger than the window', () => {
  const madeToday = { createdAt: new Date(NOW).toISOString() }

  it('is full when a pool created today has been hit today', () => {
    const reading = vitality([pool({ ...madeToday, spent: [on(0), on(0)] })], NOW)

    expect(reading.possible).toBe(1)
    expect(reading.value).toBe(1)
  })

  it('counts only the days the pool has existed for', () => {
    const twoDaysOld = new Date(NOW)
    twoDaysOld.setDate(twoDaysOld.getDate() - 2)

    const reading = vitality([pool({ createdAt: twoDaysOld.toISOString() })], NOW)

    // Today, yesterday and the day before — three days, not seven.
    expect(reading.possible).toBe(3)
  })

  it('still counts the whole window once the pool is old enough', () => {
    expect(vitality([pool()], NOW).possible).toBe(7)
  })
})

/**
 * The reported bug, kept as the case that would go wrong again.
 *
 * _"Hit my water and veggie/fruit goals and my health bar is empty
 * still."_ It was: the targets were created today and counted one day
 * each, while the limits were judged across the whole window — so a
 * caffeine pool that had been over all week spent seven overruns against
 * three perfect target-days. Measured before the fix: met 3, over 7,
 * possible 3, value 0.
 */
describe('a limit older than the restoratives', () => {
  const madeToday = new Date(NOW).toISOString()
  /*
   * Over on every day *before* today — the shape actually reported, where
   * the limits had been running for weeks and the restoratives were set
   * up this afternoon. Today itself is clean.
   */
  const overBeforeToday = [1, 2, 3, 4, 5, 6].flatMap((back) => [on(back), on(back), on(back)])

  const threeHitToday = [
    pool({ id: 'w' as ViceId, name: 'Water', capacity: 1, createdAt: madeToday, spent: [on(0)] }),
    pool({ id: 'f' as ViceId, name: 'Fruit', capacity: 1, createdAt: madeToday, spent: [on(0)] }),
    pool({ id: 'v' as ViceId, name: 'Veg', capacity: 1, createdAt: madeToday, spent: [on(0)] }),
  ]

  it('is full when every restorative was hit on the only day it existed', () => {
    const older = pool({
      id: 'caf' as ViceId,
      name: 'Caffeine',
      capacity: 1,
      direction: 'limit',
      createdAt: '2026-01-01T00:00:00.000Z',
      spent: overBeforeToday,
    })

    const reading = vitality([...threeHitToday, older], NOW)

    // Only today had anything to measure, and today was perfect.
    expect(reading.possible).toBe(3)
    expect(reading.value).toBe(1)
  })

  /*
   * The half that must still work: an overrun on a day that *was* being
   * kept has to cost something, or the limits stop mattering.
   */
  it('still drains when the overrun lands on a day being kept', () => {
    const overToday = pool({
      id: 'caf' as ViceId,
      name: 'Caffeine',
      capacity: 1,
      direction: 'limit',
      createdAt: '2026-01-01T00:00:00.000Z',
      spent: [on(0), on(0), on(0)],
    })

    const reading = vitality([...threeHitToday, overToday], NOW)

    expect(reading.over).toBe(1)
    expect(reading.value).toBeCloseTo(2 / 3)
  })

  /*
   * Starts full: nothing recorded either way on the day a restorative
   * was created is still a day you have not missed anything on... but a
   * day you did nothing on is a day missed, which is the drain.
   */
  it('is empty when the only day being kept was missed entirely', () => {
    const missed = pool({ id: 'w' as ViceId, capacity: 1, createdAt: madeToday, spent: [] })

    expect(vitality([missed], NOW).value).toBe(0)
  })
})
