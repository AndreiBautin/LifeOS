import { describe, expect, it } from 'vitest'

import { buildAvatar } from './avatar'

/**
 * The avatar re-presents the sheet and must never add to it.
 *
 * That is the property these are really about. Every field has to be
 * traceable to XP or to the calendar — because a portrait carrying a
 * number of its own would be a fourth currency, and the model has three
 * deliberately.
 */

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

/*
 * **A "what you are carrying" block was here and went with `gearFrom`.**
 * It asserted that the portrait counted what you had bought rather than
 * what you wanted, and excluded the house's upgrades from yours. Both
 * rules still exist and are still tested — `isOwned` and `isOwnArea` are
 * the Base screen's own split, covered in `base.test.ts` and
 * `shelf.test.ts`. What is gone is this model's copy of them, asked for
 * as *"no need to track or show upgrades in that card."*
 */

describe('the portrait as a whole', () => {
  const standing = { xp: 250, level: 3, into: 50, needed: 200 }

  it('draws the ring from XP into the level, which is a real denominator', () => {
    const avatar = buildAvatar({ standing, season: 'autumn' })

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
      season: 'winter',
    })

    expect(avatar.progress).toBe(1)
    expect(Number.isNaN(avatar.progress)).toBe(false)
  })

  it('is drawable on an empty database', () => {
    // Level 1 — and nothing undefined that a component would have to
    // guard.
    const avatar = buildAvatar({
      standing: { xp: 0, level: 1, into: 0, needed: 100 },
      season: 'summer',
    })

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
