import { describe, expect, it } from 'vitest'

import {
  baseContents,
  isBase,
  isOwnArea,
  isJobs,
  isMind,
  isTraining,
  isUpkeep,
  keepFor,
  RECORD_HOMES,
  type Homed,
  type RecordHome,
} from './base'
import type { Daily } from '@/domain/dailies/daily'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'

/**
 * Base is a place records are filed, not a place they are stored.
 *
 * The whole design rests on one optional field, and the failure it can
 * produce is silent in exactly one direction: a screen that forgets to
 * exclude Base shows a house job in the quest log *and* on the Base page,
 * where it reads as a duplicate rather than as a bug. So the two halves
 * are named, and every list that can return both has to say which it
 * wants.
 */

const homed = (belongsTo?: RecordHome): Homed => (belongsTo === undefined ? {} : { belongsTo })

describe('which area owns a record', () => {
  it('treats an unmarked record as belonging to its own area', () => {
    // The right answer for every row written before Base existed, and for
    // anything added without thinking about it.
    expect(isOwnArea(homed())).toBe(true)
    expect(isBase(homed())).toBe(false)
  })

  it('treats a marked record as belonging to Base', () => {
    expect(isBase(homed('base'))).toBe(true)
    expect(isOwnArea(homed('base'))).toBe(false)
  })

  it('treats a record filed to the body as neither of the other two', () => {
    expect(isUpkeep(homed('vitals'))).toBe(true)
    expect(isBase(homed('vitals'))).toBe(false)
    expect(isOwnArea(homed('vitals'))).toBe(false)
  })

  /*
   * The property the whole split depends on: every record lands on
   * exactly one side. If any two overlapped a record would be counted
   * twice, and if they left a gap it would vanish from every screen.
   *
   * Driven off `RECORD_HOMES` rather than a hand-written list, so adding
   * a fourth area cannot leave this passing vacuously — which is exactly
   * what it did when the body was added and this still only knew about
   * two.
   */
  it('puts every record on exactly one side', () => {
    const everyHome: readonly Homed[] = [homed(), ...RECORD_HOMES.map((home) => homed(home))]

    for (const record of everyHome) {
      expect(
        [
          isOwnArea(record),
          isBase(record),
          isUpkeep(record),
          isTraining(record),
          isJobs(record),
          isMind(record),
        ].filter(Boolean),
      ).toHaveLength(1)
    }
  })
})

describe('filtering a list by side', () => {
  const records = [homed(), homed('base'), homed(), homed('base')]

  it('keeps only what the caller asked for', () => {
    expect(keepFor(records, 'own-area')).toHaveLength(2)
    expect(keepFor(records, 'base')).toHaveLength(2)
    expect(keepFor([...records, homed('vitals')], 'vitals')).toHaveLength(1)
  })

  /*
   * `both` exists for the places that genuinely want everything — a
   * backup, a sync payload — and returns the array untouched rather than
   * a filtered copy, so a caller can rely on identity.
   */
  it('returns everything untouched when asked for both', () => {
    expect(keepFor(records, 'both')).toBe(records)
  })

  it('adds up to the whole, with nothing double-counted', () => {
    const all = [...records, homed('vitals')]
    const counted =
      keepFor(all, 'own-area').length +
      RECORD_HOMES.reduce((total, home) => total + keepFor(all, home).length, 0)

    expect(counted).toBe(all.length)
  })
})

describe('what Base holds', () => {
  const project = (belongsTo?: 'base'): Project => ({ ...homed(belongsTo) }) as Project
  const daily = (belongsTo?: 'base'): Daily => ({ ...homed(belongsTo) }) as Daily
  const upgrade = (belongsTo?: 'base'): Upgrade => ({ ...homed(belongsTo) }) as Upgrade

  it('gathers the three kinds and leaves the rest', () => {
    const contents = baseContents(
      [project('base'), project()],
      [daily('base'), daily(), daily('base')],
      [upgrade(), upgrade('base')],
    )

    expect(contents.projects).toHaveLength(1)
    expect(contents.chores).toHaveLength(2)
    expect(contents.upgrades).toHaveLength(1)
  })

  it('is empty rather than absent when nothing has been filed there', () => {
    const contents = baseContents([project()], [daily()], [upgrade()])

    expect(contents.projects).toEqual([])
    expect(contents.chores).toEqual([])
    expect(contents.upgrades).toEqual([])
  })
})
