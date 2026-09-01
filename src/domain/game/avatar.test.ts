import { describe, expect, it } from 'vitest'

import { buildAvatar, callingFrom, gearFrom, wantedFrom, WANTED_SHOWN, AREA_TITLES } from './avatar'
import { LIFE_AREAS } from './registry'
import { asUpgradeId } from '@/domain/ids/ids'
import type { Upgrade } from '@/domain/upgrades/upgrade'

/**
 * The avatar re-presents the sheet and must never add to it.
 *
 * That is the property these are really about. Every field has to be
 * traceable to XP, to an owned upgrade, or to the calendar — because a
 * portrait carrying a number of its own would be a fourth currency, and
 * the model has three deliberately.
 */

const area = (name: string, xp: number) => ({ area: name, name, xp })

const upgrade = (over: Partial<Upgrade>): Upgrade => ({
  id: asUpgradeId(over.title ?? 'u'),
  title: 'Thing',
  category: 'gym',
  priority: 50,
  status: 'purchased',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('what you are, mostly', () => {
  it('is the area that has paid the most XP', () => {
    const calling = callingFrom([area('training', 300), area('places', 120)])

    expect(calling?.area).toBe('training')
    expect(calling?.title).toBe(AREA_TITLES.training)
  })

  /*
   * XP is the only quantity comparable across areas — that is the whole
   * reason it is a single currency. Ladders cannot answer this: Advanced
   * on the squat and Advanced at exploration are anchored to different
   * external standards and are not the same distance from anywhere.
   */
  it('reports the share, so the label can be weighed', () => {
    const calling = callingFrom([area('training', 300), area('places', 100)])

    expect(calling?.share).toBeCloseTo(0.75, 5)
  })

  /*
   * Absent, never a default. "You have not done anything yet" and "you
   * are a novice Athlete" are different statements, and only the first
   * is true of an empty database.
   */
  it('has no calling before anything has been done', () => {
    expect(callingFrom([])).toBeUndefined()
    expect(callingFrom([area('training', 0), area('places', 0)])).toBeUndefined()
  })

  it('breaks a tie by the registry’s order, not the caller’s', () => {
    const forwards = callingFrom([area('training', 100), area('backlog', 100)])
    const backwards = callingFrom([area('backlog', 100), area('training', 100)])

    expect(forwards?.area).toBe(backwards?.area)
  })

  it('names every area the registry declares', () => {
    // A new area with no title would read as "Adventurer" forever, which
    // is the kind of gap that survives because nothing fails.
    for (const one of LIFE_AREAS) expect(AREA_TITLES[one]).toBeTruthy()
  })
})

describe('what you are carrying', () => {
  it('counts what you bought and not what you want', () => {
    const gear = gearFrom([
      upgrade({ title: 'Belt', status: 'purchased' }),
      upgrade({ title: 'Rack', status: 'idea' }),
    ])

    expect(gear.flatMap((slot) => slot.items)).toEqual(['Belt'])
  })

  /*
   * The split you already make on the Base screen: a dishwasher is an
   * upgrade to the place you live, a belt is an upgrade to you. Two
   * existing fields decide it and no new one was added.
   */
  it('leaves the house’s upgrades to the house', () => {
    const gear = gearFrom([
      upgrade({ title: 'Belt' }),
      upgrade({ title: 'Dishwasher', category: 'home', belongsTo: 'base' }),
    ])

    expect(gear.flatMap((slot) => slot.items)).toEqual(['Belt'])
  })

  it('groups by the upgrade’s own category', () => {
    const gear = gearFrom([
      upgrade({ title: 'Belt', category: 'gym' }),
      upgrade({ title: 'Straps', category: 'gym' }),
      upgrade({ title: 'Monitor', category: 'office' }),
    ])

    expect(gear[0]?.items).toEqual(['Belt', 'Straps'])
    expect(gear[0]?.label).toBe('Gym')
    expect(gear[1]?.items).toEqual(['Monitor'])
  })

  it('has nothing to show before anything is owned', () => {
    expect(gearFrom([])).toEqual([])
  })
})

describe('the portrait as a whole', () => {
  const standing = { xp: 250, level: 3, into: 50, needed: 200 }

  it('draws the ring from XP into the level, which is a real denominator', () => {
    const avatar = buildAvatar({
      standing,
      areas: [area('training', 250)],
      upgrades: [],
      season: 'autumn',
    })

    expect(avatar.progress).toBeCloseTo(0.25, 5)
    expect(avatar.level).toBe(3)
  })

  /*
   * `needed` is zero at the top of the ladder, and a ring drawn from
   * `0 / 0` is NaN — which renders as an invisible arc rather than as an
   * error, so it would look like a bug nobody could locate.
   */
  it('shows a full ring rather than NaN at the top of the ladder', () => {
    const avatar = buildAvatar({
      standing: { xp: 9999, level: 20, into: 0, needed: 0 },
      areas: [area('training', 9999)],
      upgrades: [],
      season: 'winter',
    })

    expect(avatar.progress).toBe(1)
    expect(Number.isNaN(avatar.progress)).toBe(false)
  })

  it('totals the gear it is showing', () => {
    const avatar = buildAvatar({
      standing,
      areas: [area('training', 250)],
      upgrades: [
        upgrade({ title: 'Belt' }),
        upgrade({ title: 'Straps' }),
        upgrade({ title: 'Dishwasher', belongsTo: 'base' }),
      ],
      season: 'spring',
    })

    expect(avatar.gearCount).toBe(2)
  })

  it('is drawable on an empty database', () => {
    // Level 1, no calling, no gear — and nothing undefined that a
    // component would have to guard.
    const avatar = buildAvatar({
      standing: { xp: 0, level: 1, into: 0, needed: 100 },
      areas: [],
      upgrades: [],
      season: 'summer',
    })

    expect(avatar.calling).toBeUndefined()
    expect(avatar.gear).toEqual([])
    expect(avatar.progress).toBe(0)
    expect(avatar.season).toBe('summer')
  })
})

describe('what you mean to be carrying', () => {
  it('lists gear you have not bought, most wanted first', () => {
    const wanted = wantedFrom([
      upgrade({ title: 'Boots', shelf: 'gear', status: 'idea', priority: 60 }),
      upgrade({ title: 'Jacket', shelf: 'gear', status: 'idea', priority: 90 }),
    ])

    expect(wanted.map((one) => one.title)).toEqual(['Jacket', 'Boots'])
  })

  it('leaves out what you already own', () => {
    const wanted = wantedFrom([
      upgrade({ title: 'Belt', shelf: 'gear', status: 'purchased' }),
      upgrade({ title: 'Boots', shelf: 'gear', status: 'idea' }),
    ])

    expect(wanted.map((one) => one.title)).toEqual(['Boots'])
  })

  /*
   * Something you decided against is not something you want, which is
   * why this reads `isOpen` rather than "not purchased".
   */
  it('leaves out what you cancelled', () => {
    expect(wantedFrom([upgrade({ title: 'Boots', shelf: 'gear', status: 'cancelled' })])).toEqual(
      [],
    )
  })

  /*
   * The deliberate asymmetry with the equipped list, which counts both
   * non-house shelves. Wanted tech already has a screen that does it
   * better — with gates, prerequisites and a budget — so duplicating it
   * on the character sheet would add nothing and make "gear" mean
   * something else.
   */
  it('is the gear shelf only, not the tech tree', () => {
    const wanted = wantedFrom([
      upgrade({ title: 'Boots', shelf: 'gear', status: 'idea' }),
      upgrade({ title: 'Monitor', shelf: 'tech', status: 'idea' }),
      upgrade({ title: 'Dishwasher', shelf: 'base', belongsTo: 'base', status: 'idea' }),
    ])

    expect(wanted.map((one) => one.title)).toEqual(['Boots'])
  })

  it('carries the cost when there is one, and says nothing when there is not', () => {
    const [priced, unpriced] = wantedFrom([
      upgrade({
        title: 'Boots',
        shelf: 'gear',
        status: 'idea',
        priority: 90,
        estimatedCostMinorUnits: 12_000,
      }),
      upgrade({ title: 'Cap', shelf: 'gear', status: 'idea', priority: 10 }),
    ])

    expect(priced?.costMinorUnits).toBe(12_000)
    expect(unpriced?.costMinorUnits).toBeUndefined()
  })

  /*
   * A wishlist that scrolls is a list, and this sits on a screen that is
   * scanned. The rest is on the Gear page, and the overflow is counted
   * rather than dropped silently.
   */
  it('shows a few and counts the rest', () => {
    const many = Array.from({ length: WANTED_SHOWN + 3 }, (_unused, index) =>
      upgrade({
        title: `Item ${String(index)}`,
        shelf: 'gear',
        status: 'idea',
        priority: 100 - index,
      }),
    )

    const avatar = buildAvatar({
      standing: { level: 3, into: 10, needed: 100, xp: 10 },
      season: 'summer',
      areas: [],
      upgrades: many,
    })

    expect(avatar.wanted).toHaveLength(WANTED_SHOWN)
    expect(avatar.wantedBeyond).toBe(3)
  })
})
