import { describe, expect, it } from 'vitest'

import { asUpgradeId } from '@/domain/ids/ids'
import type { Upgrade, UpgradeStatus } from '@/domain/upgrades/upgrade'

import { dropped, owned, wanted } from './wishlist'

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
