import { describe, expect, it } from 'vitest'

import { asUpgradeId } from '@/domain/ids/ids'
import type { Upgrade, UpgradeStatus } from '@/domain/upgrades/upgrade'

import { dropped, owned, wanted, wishlistTotal } from './wishlist'

function upgrade(title: string, status: UpgradeStatus, cost?: number, priority = 50): Upgrade {
  return {
    id: asUpgradeId(title),
    title,
    category: 'home',
    priority,
    status,
    createdAt: '2026-08-01T09:00:00.000Z',
    ...(cost === undefined ? {} : { estimatedCostMinorUnits: cost }),
  }
}

const list = [
  upgrade('Dishwasher', 'idea', 45_000, 80),
  upgrade('Couch', 'researching', undefined, 90),
  upgrade('Rug', 'idea', 12_000, 20),
  upgrade('Old lamp', 'cancelled', 5_000),
  upgrade('Kettle', 'purchased', 4_000),
]

describe('splitting the house list', () => {
  it('wants what is still open, most wanted first', () => {
    expect(wanted(list).map((one) => one.title)).toEqual(['Couch', 'Dishwasher', 'Rug'])
  })

  it('owns only what was bought', () => {
    expect(owned(list).map((one) => one.title)).toEqual(['Kettle'])
  })

  /*
   * Cancelled is neither. Something decided against is not on a
   * wishlist, and it is not in the house either.
   */
  it('leaves cancelled out of both', () => {
    expect(wanted(list).some((one) => one.title === 'Old lamp')).toBe(false)
    expect(owned(list).some((one) => one.title === 'Old lamp')).toBe(false)
  })
})

describe('what the list comes to', () => {
  it('sums the costs that exist', () => {
    expect(wishlistTotal(list).minorUnits).toBe(57_000)
    expect(wishlistTotal(list).priced).toBe(2)
  })

  /*
   * The load-bearing one. A couch with no estimate is not a free couch,
   * and a total that folded it in as zero would be understated in the
   * direction that matters — you would be saving for a figure the list
   * cannot support.
   */
  it('counts what has no price rather than treating it as free', () => {
    expect(wishlistTotal(list).unpriced).toBe(1)
  })

  it('does not count what is already bought or cancelled', () => {
    expect(wishlistTotal([upgrade('Kettle', 'purchased', 4_000)]).minorUnits).toBe(0)
    expect(wishlistTotal([upgrade('Old lamp', 'cancelled', 5_000)]).priced).toBe(0)
  })

  it('says nothing much about an empty list', () => {
    expect(wishlistTotal([])).toEqual({ minorUnits: 0, priced: 0, unpriced: 0 })
  })
})

/*
 * Cancelled belongs in neither list and must still be reachable: the
 * only control that can un-cancel it lives on its row, so a screen that
 * renders no row has taken the decision away.
 */
describe('things decided against', () => {
  it('collects the cancelled ones', () => {
    expect(dropped(list).map((one) => one.title)).toEqual(['Old lamp'])
  })

  it('accounts for every upgrade across the three lists', () => {
    const total = wanted(list).length + owned(list).length + dropped(list).length

    expect(total).toBe(list.length)
  })
})
