import { describe, expect, it } from 'vitest'

import type { FinanceReading } from '@/domain/finance/reading'
import type { UpgradeId } from '@/domain/ids/ids'
import type { Upgrade } from '@/domain/upgrades/upgrade'

import { spendingPool } from './pool'

function reading(month: string, surplusMinor?: number): FinanceReading {
  return { month, ...(surplusMinor === undefined ? {} : { surplusMinor }) }
}

function upgrade(id: string, status: Upgrade['status'], costMinor?: number): Upgrade {
  return {
    id: id as UpgradeId,
    title: id,
    status,
    priority: 50,
    category: 'other',
    ...(costMinor === undefined ? {} : { estimatedCostMinorUnits: costMinor }),
  } as Upgrade
}

describe('spendingPool', () => {
  it('banks every recorded surplus and subtracts what was bought', () => {
    const pool = spendingPool(
      [reading('2026-07', 40_000), reading('2026-08', 60_000)],
      [upgrade('desk', 'purchased', 25_000), upgrade('lamp', 'ready-to-buy', 5_000)],
    )

    expect(pool.bankedMinor).toBe(100_000)
    expect(pool.spentMinor).toBe(25_000)
    expect(pool.availableMinor).toBe(75_000)
    expect(pool.monthsBanked).toBe(2)
  })

  /*
   * A month nobody tallied is not a month with nothing spare — the
   * absent-never-zero rule. It must not count towards `monthsBanked`
   * either, or "3 months banked" would describe months that said
   * nothing.
   */
  it('ignores a month with no surplus recorded rather than counting it as zero', () => {
    const pool = spendingPool([reading('2026-07', 40_000), reading('2026-08')], [])

    expect(pool.bankedMinor).toBe(40_000)
    expect(pool.monthsBanked).toBe(1)
  })

  /*
   * The one that would be wrong quietly. Flooring at zero would forget
   * an overspend by the next month, so the pool would refill to the next
   * surplus rather than starting from the hole it is actually in.
   */
  it('goes negative when more was bought than banked, rather than flooring at zero', () => {
    const pool = spendingPool([reading('2026-07', 10_000)], [upgrade('desk', 'purchased', 30_000)])

    expect(pool.availableMinor).toBe(-20_000)
  })

  /*
   * A purchase with no cost recorded is not a free purchase. Counting it
   * as zero would read the pool high in the one direction that matters,
   * so it is reported instead — the rule `wishlistTotal` already holds.
   */
  it('reports purchases with no cost rather than treating them as free', () => {
    const pool = spendingPool(
      [reading('2026-07', 50_000)],
      [upgrade('desk', 'purchased'), upgrade('chair', 'purchased', 10_000)],
    )

    expect(pool.spentMinor).toBe(10_000)
    expect(pool.unpricedPurchases).toBe(1)
  })

  /* Only what was actually bought spends the pool. */
  it('does not spend the pool on things merely wanted or dropped', () => {
    const pool = spendingPool(
      [reading('2026-07', 50_000)],
      [upgrade('desk', 'ready-to-buy', 30_000), upgrade('rug', 'cancelled', 20_000)],
    )

    expect(pool.spentMinor).toBe(0)
    expect(pool.availableMinor).toBe(50_000)
  })
})
