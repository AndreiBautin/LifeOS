import { describe, expect, it } from 'vitest'

import { BASE, isBase } from '@/domain/base/base'
import { asUpgradeId } from '@/domain/ids/ids'
import type { Upgrade } from './upgrade'
import { homeForShelf, onShelf, shelfOf, UPGRADE_SHELVES, type UpgradeShelf } from './shelf'

function upgrade(title: string, over: Partial<Upgrade> = {}): Upgrade {
  return {
    id: asUpgradeId(title),
    title,
    category: 'other',
    priority: 50,
    status: 'idea',
    createdAt: '2026-08-01T09:00:00.000Z',
    ...over,
  }
}

describe('which shelf an upgrade sits on', () => {
  /*
   * Absent means what it always meant, the rule `belongsTo` follows. A
   * record written before shelves existed must land where it already
   * was, or the split would silently move somebody's list.
   */
  it('reads a record with no shelf as the split that shipped', () => {
    expect(shelfOf(upgrade('Dishwasher', { belongsTo: BASE }))).toBe('base')
    expect(shelfOf(upgrade('Monitor'))).toBe('tech')
  })

  it('starts the gear shelf empty rather than inventing members', () => {
    const stored = [upgrade('Dishwasher', { belongsTo: BASE }), upgrade('Monitor')]

    expect(onShelf(stored, 'gear')).toEqual([])
  })

  it('takes a stored shelf over the fallback', () => {
    expect(shelfOf(upgrade('Boots', { shelf: 'gear' }))).toBe('gear')
    expect(shelfOf(upgrade('MacBook', { belongsTo: BASE, shelf: 'tech' }))).toBe('tech')
  })

  it('files each record to exactly one shelf', () => {
    const stored = [
      upgrade('Desk', { belongsTo: BASE, shelf: 'base' }),
      upgrade('Monitor', { shelf: 'tech' }),
      upgrade('Boots', { shelf: 'gear' }),
    ]

    const counted = UPGRADE_SHELVES.reduce((sum, shelf) => sum + onShelf(stored, shelf).length, 0)

    expect(counted).toBe(stored.length)
  })
})

/*
 * `belongsTo` is the area answer and `shelf` is the finer one, and they
 * have to agree about the house or the Base screen and the shelf would
 * disagree about the same record. One writer keeps them in step; this is
 * the invariant that writer has to hold.
 */
describe('the area a shelf files to', () => {
  it('puts only the base shelf in the Base area', () => {
    expect(homeForShelf('base')).toBe(BASE)
    expect(homeForShelf('tech')).toBeUndefined()
    expect(homeForShelf('gear')).toBeUndefined()
  })

  it('agrees with isBase for every shelf', () => {
    for (const shelf of UPGRADE_SHELVES) {
      const home = homeForShelf(shelf)
      const record = upgrade('x', { shelf, ...(home === undefined ? {} : { belongsTo: home }) })

      expect(isBase(record)).toBe(shelf === 'base')
      expect(shelfOf(record)).toBe(shelf)
    }
  })

  it('has a label and a blurb for every shelf', async () => {
    const { UPGRADE_SHELF_LABELS, UPGRADE_SHELF_BLURBS } = await import('./shelf')

    for (const shelf of UPGRADE_SHELVES satisfies readonly UpgradeShelf[]) {
      expect(UPGRADE_SHELF_LABELS[shelf].length).toBeGreaterThan(0)
      expect(UPGRADE_SHELF_BLURBS[shelf].length).toBeGreaterThan(0)
    }
  })
})
