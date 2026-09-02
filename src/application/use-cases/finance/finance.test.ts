import { describe, expect, it } from 'vitest'

import { listFinance, recordFinance, type FinanceDeps } from './finance'
import type { FinanceReading } from '@/domain/finance/reading'

/**
 * The money figures.
 *
 * The arithmetic lives in `domain/finance/reading.ts`; what is worth
 * holding here is the one decision this layer makes — that a month is a
 * row being filled in over time, not three rows pretending to be one.
 */

const NOW = new Date('2026-08-31T12:00:00.000Z')

function deps(seed: FinanceReading[] = []): FinanceDeps & { readonly stored: FinanceReading[] } {
  return {
    stored: seed,
    finance: {
      all: () => Promise.resolve(seed),
      save: (reading) => {
        const at = seed.findIndex((one) => one.month === reading.month)
        if (at >= 0) seed[at] = reading
        else seed.push(reading)
        return Promise.resolve()
      },
      restoreMany: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      purge: () => Promise.resolve(),
    },
    clock: { now: () => NOW },
  }
}

describe('recording a month', () => {
  it('files it under the month the person is in', async () => {
    const services = deps()

    expect((await recordFinance({ netWorthMinor: 1_234_56 }, services)).month).toBe('2026-08')
  })

  /*
   * **Every figure a reading can hold reaches the database.**
   *
   * The salary did not, and nothing caught it: the input type still
   * named three fields while `FinanceReading` had four, and the merge
   * was built with conditional spreads — which defeat excess-property
   * checking, so a value the form collected compiled cleanly and went
   * nowhere. Found by driving the app, not by the suite.
   *
   * Written over the figures rather than naming them one by one, because
   * a hand-written list beside a list that already exists is the thing
   * that drifted in the first place.
   */
  it('writes every figure it is given, not the ones it used to know about', async () => {
    const services = deps()
    const given = {
      netWorthMinor: 150_000_00,
      retirementMinor: 95_000_00,
      salaryMinor: 120_000_00,
      creditScore: 762,
    }

    const saved = await recordFinance(given, services)

    for (const [key, value] of Object.entries(given)) {
      expect(saved[key as keyof typeof given], key).toBe(value)
    }
  })

  /*
   * The reason this is a merge and not a save. The three figures arrive
   * at different times — a statement on the 1st, a credit score whenever
   * the issuer refreshes it — so entering one must not blank the others.
   */
  it('keeps figures already recorded for that month', async () => {
    const services = deps([{ month: '2026-08', netWorthMinor: 1_000_00, creditScore: 700 }])

    const after = await recordFinance({ retirementMinor: 500_00 }, services)

    expect(after.netWorthMinor).toBe(1_000_00)
    expect(after.creditScore).toBe(700)
    expect(after.retirementMinor).toBe(500_00)
  })

  it('corrects a figure rather than adding a second row', async () => {
    const services = deps([{ month: '2026-08', netWorthMinor: 1_000_00 }])

    await recordFinance({ netWorthMinor: 1_100_00 }, services)

    expect(services.stored).toHaveLength(1)
    expect(services.stored[0]?.netWorthMinor).toBe(1_100_00)
  })

  /*
   * An empty box is "I did not check", and there is no way to tell that
   * from "I meant zero" once it has been written down. Of the two
   * readings, the one that would corrupt a series is the one this
   * refuses to make.
   */
  it('leaves an untouched figure alone rather than clearing it', async () => {
    const services = deps([{ month: '2026-08', creditScore: 740 }])

    expect((await recordFinance({ netWorthMinor: 1 }, services)).creditScore).toBe(740)
  })

  it('reads back newest first', async () => {
    const services = deps([
      { month: '2026-06', netWorthMinor: 1 },
      { month: '2026-08', netWorthMinor: 3 },
      { month: '2026-07', netWorthMinor: 2 },
    ])

    expect((await listFinance(services)).map((one) => one.month)).toEqual([
      '2026-08',
      '2026-07',
      '2026-06',
    ])
  })
})
