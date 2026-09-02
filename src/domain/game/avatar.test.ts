import { describe, expect, it } from 'vitest'

import { buildAvatar, gearFrom } from './avatar'
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

const upgrade = (over: Partial<Upgrade>): Upgrade => ({
  id: asUpgradeId(over.title ?? 'u'),
  title: 'Thing',
  category: 'gym',
  priority: 50,
  status: 'purchased',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

/*
 * **There was a "what you are, mostly" block here and it is gone with
 * the derivation it covered.** `mainstayFrom` named the area that had
 * paid the most XP and its share of the whole, which the card read as
 * "100% of your XP is dailies"; the line was dropped along with the
 * flavour titles it had been the evidence for.
 *
 * Nothing it asserted is now unwatched. The tie-break it tested was
 * about that function alone, and what it existed to prove — that XP is
 * comparable across areas and can be split by where it came from — is
 * `traits.test.ts`, which requires the eight trait totals to sum to the
 * XP total exactly.
 */

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
      upgrades: [],
      season: 'winter',
    })

    expect(avatar.progress).toBe(1)
    expect(Number.isNaN(avatar.progress)).toBe(false)
  })

  it('totals the gear it is showing', () => {
    const avatar = buildAvatar({
      standing,
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
    // Level 1 and no gear — and nothing undefined that a component
    // would have to guard.
    const avatar = buildAvatar({
      standing: { xp: 0, level: 1, into: 0, needed: 100 },
      upgrades: [],
      season: 'summer',
    })

    expect(avatar.gear).toEqual([])
    expect(avatar.progress).toBe(0)
    expect(avatar.season).toBe('summer')
  })
})

/*
 * **The wishlist tests went with the wishlist.** `wantedFrom` listed
 * open upgrades on the `gear` shelf, and that shelf was removed for want
 * of anything on it — so there is nothing left for these to assert
 * about.
 *
 * The rule they were protecting is not lost by deletion, because it was
 * a rule *about* that shelf: "the wishlist is the gear shelf only". What
 * survives is the equipped list above, which never read the shelf at all
 * — it asks `isOwned` and `isOwnArea` — and is still tested in "what you
 * are carrying".
 */
