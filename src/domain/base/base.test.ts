import { describe, expect, it } from 'vitest'

import { isBase, isOwnArea, keepFor, RECORD_HOMES, type Homed, type RecordHome } from './base'

/**
 * Base is a place records are filed, not a place they are stored.
 *
 * The design rests on one optional field, and the failure it can produce
 * is silent in exactly one direction: a screen that forgets to exclude
 * Base shows a house upgrade on both screens, where it reads as a
 * duplicate rather than as a bug. So the two halves are named, and every
 * list that can return both has to say which it wants.
 */

const homed = (belongsTo?: RecordHome): Homed => (belongsTo === undefined ? {} : { belongsTo })

describe('which area owns a record', () => {
  it('treats an unmarked record as belonging to its own area', () => {
    expect(isOwnArea(homed())).toBe(true)
    expect(isBase(homed())).toBe(false)
  })

  it('treats a marked record as belonging to Base', () => {
    expect(isBase(homed('base'))).toBe(true)
    expect(isOwnArea(homed('base'))).toBe(false)
  })

  /*
   * Every record lands on exactly one side. Driven off `RECORD_HOMES`, so
   * a home added later cannot leave this passing vacuously.
   */
  it('puts every record on exactly one side', () => {
    const records = [homed(), ...RECORD_HOMES.map((home) => homed(home))]

    for (const record of records) {
      const sides = [isOwnArea(record), ...RECORD_HOMES.map((home) => record.belongsTo === home)]
      expect(sides.filter(Boolean)).toHaveLength(1)
    }
  })

  it('keeps the side a list asked for', () => {
    const records = [homed(), homed('base')]

    expect(keepFor(records, 'own-area')).toEqual([homed()])
    expect(keepFor(records, 'base')).toEqual([homed('base')])
    expect(keepFor(records, 'both')).toEqual(records)
  })
})
