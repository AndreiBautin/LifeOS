import { describe, expect, it } from 'vitest'

import { toDayKey, toMonthKey } from './day'

/**
 * The one thing worth pinning: these are **local**, not UTC.
 *
 * Five copies of this helper existed before it was one, and the failure
 * they were all quietly avoiding is the same: `toISOString()` is UTC, so
 * west of Greenwich an evening entry is filed under tomorrow. A streak
 * breaks that was never broken, and a session lands in a week that has not
 * started.
 */
describe('day keys', () => {
  it('uses the local day rather than the UTC one', () => {
    // 2026-08-27 at 23:30 local. In any timezone behind UTC this is
    // already the 28th at Greenwich, and `toISOString().slice(0, 10)`
    // would say so.
    const lateEvening = new Date(2026, 7, 27, 23, 30)

    expect(toDayKey(lateEvening)).toBe('2026-08-27')
  })

  it('uses the local month for the same reason', () => {
    // The last evening of the month is the case that moves a reading into
    // the next month's review.
    const lastNight = new Date(2026, 7, 31, 23, 30)

    expect(toMonthKey(lastNight)).toBe('2026-08')
  })

  it('pads so the keys sort lexically', () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toDayKey(new Date(2026, 0, 5)) < toDayKey(new Date(2026, 0, 12))).toBe(true)
    expect(toDayKey(new Date(2025, 11, 31)) < toDayKey(new Date(2026, 0, 1))).toBe(true)
  })

  it('agrees with itself across the two functions', () => {
    const when = new Date(2026, 5, 9, 14, 0)

    expect(toDayKey(when).startsWith(toMonthKey(when))).toBe(true)
  })
})
