import { describe, expect, it } from 'vitest'

import {
  ageFromBirthYear,
  netWorthPercentile,
  NET_WORTH_BY_AGE,
  retirementAgainstBenchmark,
  retirementMultipleFor,
} from './standards'

/**
 * These are about the two properties that make a ladder a ladder: it is
 * anchored to something published, and it is exact where a level
 * changes. Everything between the breakpoints is a readable position and
 * is deliberately not asserted to a precision the source cannot support.
 */

const dollars = (amount: number) => amount * 100

describe('where a net worth sits for its age', () => {
  /*
   * The four published breakpoints are what the ladder's thresholds are
   * set to, so these are the readings that decide a level. If the table
   * is ever re-keyed against a newer SCF wave, this is the test that
   * says the interpolation still lands on the published points.
   */
  it('reads the published breakpoints exactly', () => {
    expect(netWorthPercentile(dollars(11_016), 32)).toBeCloseTo(25, 6)
    expect(netWorthPercentile(dollars(88_631), 32)).toBeCloseTo(50, 6)
    expect(netWorthPercentile(dollars(186_140), 32)).toBeCloseTo(75, 6)
    expect(netWorthPercentile(dollars(538_750), 32)).toBeCloseTo(90, 6)
  })

  it('rises with the money and stays inside the scale', () => {
    const climbing = [0, 20_000, 100_000, 300_000, 900_000, 5_000_000].map(
      (amount) => netWorthPercentile(dollars(amount), 32) ?? -1,
    )

    for (let index = 1; index < climbing.length; index += 1) {
      expect(climbing[index]).toBeGreaterThan(climbing[index - 1] ?? 0)
    }
    expect(climbing.at(-1)).toBeLessThan(100)
  })

  /*
   * A percentile of exactly 100 is the claim that nobody has more, which
   * no sample can support. The top of the ladder is the 90th and is
   * reachable; the number above it keeps moving without arriving.
   */
  it('never reaches a hundred, however much there is', () => {
    expect(netWorthPercentile(dollars(1_000_000_000), 32) ?? 0).toBeLessThan(99)
    expect(netWorthPercentile(dollars(1_000_000_000), 32) ?? 0).toBeGreaterThan(90)
  })

  /*
   * Being underwater is a real position and a common one at this age. It
   * reads as the bottom of the scale rather than as a refusal, which is
   * what would happen if the ladder demanded a positive number.
   */
  it('puts a negative net worth at the bottom rather than refusing it', () => {
    expect(netWorthPercentile(dollars(-40_000), 32)).toBe(0)
  })

  it('uses the bracket for the age, not one fixed table', () => {
    const at32 = netWorthPercentile(dollars(88_631), 32) ?? 0
    const at52 = netWorthPercentile(dollars(88_631), 52) ?? 0

    // The same money is a median at 32 and well below one at 52.
    expect(at32).toBeCloseTo(50, 6)
    expect(at52).toBeLessThan(30)
  })

  it('has nothing to say about an age the survey does not cover', () => {
    expect(netWorthPercentile(dollars(50_000), 9)).toBeUndefined()
  })

  it('covers every age from 18 up without a gap', () => {
    for (let age = 18; age <= 90; age += 1) {
      expect(netWorthPercentile(dollars(1_000), age), String(age)).toBeDefined()
    }
  })

  it('keeps the published brackets ascending and touching', () => {
    for (let index = 1; index < NET_WORTH_BY_AGE.length; index += 1) {
      const previous = NET_WORTH_BY_AGE[index - 1]
      const current = NET_WORTH_BY_AGE[index]
      expect(current?.from).toBe((previous?.to ?? 0) + 1)
      expect(current?.p25).toBeLessThan(current?.p50 ?? 0)
      expect(current?.p50).toBeLessThan(current?.p75 ?? 0)
      expect(current?.p75).toBeLessThan(current?.p90 ?? 0)
    }
  })
})

describe('retirement against the benchmark for an age', () => {
  it('reads the published multiples exactly', () => {
    expect(retirementMultipleFor(30)).toBeCloseTo(1, 6)
    expect(retirementMultipleFor(40)).toBeCloseTo(3, 6)
    expect(retirementMultipleFor(67)).toBeCloseTo(10, 6)
  })

  /*
   * Interpolated rather than stepped, so a birthday does not move
   * somebody a whole level. At 32 the benchmark is 1.4x salary, between
   * the published 1x at 30 and 2x at 35.
   */
  it('interpolates between the published ages', () => {
    expect(retirementMultipleFor(32)).toBeCloseTo(1.4, 6)
  })

  it('holds the ends flat rather than extrapolating off the table', () => {
    expect(retirementMultipleFor(19)).toBeCloseTo(0.5, 6)
    expect(retirementMultipleFor(80)).toBeCloseTo(10, 6)
  })

  it('is one when the savings match the benchmark', () => {
    // 1.4x of a $100,000 salary is $140,000 at 32.
    expect(retirementAgainstBenchmark(dollars(140_000), dollars(100_000), 32)).toBeCloseTo(1, 6)
    expect(retirementAgainstBenchmark(dollars(70_000), dollars(100_000), 32)).toBeCloseTo(0.5, 6)
  })

  /*
   * Absent, never a default. The benchmark is a multiple of an income,
   * so guessing one would put somebody on a rung nothing measured —
   * which is the one thing a ladder must never do.
   */
  it('has nothing to say without an income', () => {
    expect(retirementAgainstBenchmark(dollars(140_000), undefined, 32)).toBeUndefined()
    expect(retirementAgainstBenchmark(dollars(140_000), 0, 32)).toBeUndefined()
  })
})

describe('age from a birth year', () => {
  it('is the difference of the calendar years', () => {
    expect(ageFromBirthYear(1994, new Date('2026-09-01T12:00:00Z'))).toBe(32)
  })
})
