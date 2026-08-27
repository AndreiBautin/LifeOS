import { MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'
import { describe, expect, it } from 'vitest'

import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MAX_DIRECT_SETS_PER_SESSION, reachableWeeklySets } from '@/domain/volume/frequency'
import { DEFAULT_LANDMARKS } from '@/domain/volume/landmarks'

import {
  BOTTOM_TIER_POSITION,
  completeTiers,
  DEFAULT_MUSCLE_TIERS,
  priorityPosition,
  TOP_TIER_POSITION,
  validateTiers,
  weeklyTargetFor,
  weeklyTargetForMember,
  weeklyTargetForWeek,
  type MuscleTiers,
} from './tiers'

const tier = (rank: number, members: MuscleGroup[]) => ({ rank, members })

/*
 * The property a `spreadFactor` used to destroy.
 *
 * It scaled every target by how crowded the top tier was, so promoting
 * one muscle demoted the others by an amount nobody could see — moving
 * the biceps out of tier 1 silently raised the side delts from 22 sets
 * to 24. A lifter could not state a mental map, "these four matter to
 * me", without the app renegotiating it against them.
 *
 * Independence is what is worth protecting here. Whether the total fits
 * in a week is a real constraint and a separate question, answered by
 * measuring the program the assembler builds rather than by bending the
 * targets until they look affordable.
 */
describe('a muscle tier changes that muscle and nothing else', () => {
  const base: MuscleTiers = [tier(1, ['side-delts']), tier(2, ['chest']), tier(3, ['calves'])]
  const promoted: MuscleTiers = [
    tier(1, ['side-delts', 'biceps', 'triceps', 'forearms']),
    tier(2, ['chest']),
    tier(3, ['calves']),
  ]

  it('leaves the top tier untouched when three more muscles join it', () => {
    expect(priorityPosition(promoted, 'side-delts')).toBe(priorityPosition(base, 'side-delts'))
  })

  it('leaves the lower tiers untouched too', () => {
    expect(priorityPosition(promoted, 'chest')).toBe(priorityPosition(base, 'chest'))
    expect(priorityPosition(promoted, 'calves')).toBe(priorityPosition(base, 'calves'))
  })

  it('gives a newly promoted muscle the same position as the rest of its tier', () => {
    expect(priorityPosition(promoted, 'biceps')).toBe(priorityPosition(promoted, 'side-delts'))
  })

  it('anchors the ends of the ordering where the landmarks are', () => {
    expect(priorityPosition(base, 'side-delts')).toBeCloseTo(TOP_TIER_POSITION, 6)
    expect(priorityPosition(base, 'calves')).toBeCloseTo(BOTTOM_TIER_POSITION, 6)
  })

  it('puts an untiered muscle at the bottom rather than erroring', () => {
    expect(priorityPosition(base, 'core')).toBeCloseTo(BOTTOM_TIER_POSITION, 6)
  })

  it('expresses no preference when a single tier holds everything', () => {
    const flat: MuscleTiers = [tier(1, ['chest', 'lats', 'quads'])]
    const middle = (TOP_TIER_POSITION + BOTTOM_TIER_POSITION) / 2

    expect(priorityPosition(flat, 'chest')).toBe(middle)
    expect(priorityPosition(flat, 'quads')).toBe(middle)
  })
})

describe('priority position', () => {
  it('puts the top tier high and the bottom tier low', () => {
    const tiers: MuscleTiers = [tier(1, ['chest']), tier(2, ['lats']), tier(3, ['calves'])]

    const top = priorityPosition(tiers, 'chest')
    const middle = priorityPosition(tiers, 'lats')
    const bottom = priorityPosition(tiers, 'calves')

    expect(top).toBeGreaterThan(middle)
    expect(middle).toBeGreaterThan(bottom)
    expect(top).toBeGreaterThan(0.5)
    expect(bottom).toBeLessThan(0.5)
  })

  /*
   * An empty tier still occupies its place in the ordering.
   *
   * This filtered empty tiers out, so the ordering was the one you had
   * expressed rather than the one you had declared — and moving every
   * muscle down from tier 1 to tier 2 changed nothing at all, because the
   * relative ordering was identical. `TIER_FREQUENCY` meanwhile read the
   * declared rank the whole time, so the two disagreed about what a tier
   * was: one handed tier 2 a top-of-band target and the other bought it
   * two sessions to deliver it in.
   */
  it('lowers what is below an emptied tier rather than promoting it', () => {
    const withTop: MuscleTiers = [tier(1, ['chest']), tier(2, ['lats']), tier(3, ['calves'])]
    const topEmptied: MuscleTiers = [tier(1, []), tier(2, ['lats']), tier(3, ['calves'])]

    expect(priorityPosition(topEmptied, 'lats')).toBe(priorityPosition(withTop, 'lats'))
    expect(priorityPosition(topEmptied, 'lats')).toBeLessThan(TOP_TIER_POSITION)
  })

  /*
   * The mirror case, which was live and silent: declare three tiers,
   * leave the bottom one empty, and the muscles you called "building"
   * were given maintenance volume.
   */
  it('does not drop the middle tier to the floor when the bottom is empty', () => {
    const bottomEmpty: MuscleTiers = [tier(1, ['chest']), tier(2, ['lats']), tier(3, [])]

    expect(priorityPosition(bottomEmpty, 'lats')).toBeGreaterThan(BOTTOM_TIER_POSITION)
  })

  it('treats every member of a tier identically', () => {
    // A tier is a statement about rank and nothing else — two muscles
    // sharing one must produce the same position, whichever they are.
    for (const tier of DEFAULT_MUSCLE_TIERS) {
      if (tier.members.length < 2) continue

      const positions = tier.members.map((muscle) => priorityPosition(DEFAULT_MUSCLE_TIERS, muscle))

      expect(new Set(positions).size, tier.label).toBe(1)
    }
  })

  it('places an untiered muscle at the bottom rather than throwing', () => {
    const position = priorityPosition(DEFAULT_MUSCLE_TIERS, 'front-delts')
    expect(position).toBeGreaterThanOrEqual(0)
    expect(position).toBeLessThanOrEqual(1)
  })
})

describe('turning a position into a weekly target', () => {
  const chest = DEFAULT_LANDMARKS.chest

  it('never reaches maximum recoverable volume in a normal week', () => {
    // MRV is the point past which you stop recovering. A block that
    // targets it has no room for a bad night, and arriving there early
    // means the rest of the block is spent digging out.
    expect(weeklyTargetFor(chest, 1)).toBeLessThan(chest.mrv)
  })

  it('allows the ceiling only when deliberately overreaching', () => {
    expect(weeklyTargetFor(chest, 1, { overreach: true })).toBe(chest.mrv)
  })

  it('lands at minimum effective volume a quarter of the way up', () => {
    expect(weeklyTargetFor(chest, 0.25)).toBe(chest.mev)
  })

  it('puts the middle of the ordering in the productive band, not at its floor', () => {
    // A muscle a lifter named as one to build should get building volume.
    const middle = weeklyTargetFor(chest, 0.5)
    expect(middle).toBeGreaterThan(chest.mev)
    expect(middle).toBeLessThan(chest.mav)
  })

  it('drops toward maintenance at the bottom', () => {
    expect(weeklyTargetFor(chest, 0)).toBe(chest.mv)
  })

  it('is monotonic in position', () => {
    const targets = [0, 0.25, 0.5, 0.75, 1].map((p) => weeklyTargetFor(chest, p))
    const sorted = [...targets].sort((a, b) => a - b)

    expect(targets).toEqual(sorted)
  })
})

describe('the target, week by week', () => {
  const biceps = DEFAULT_LANDMARKS.biceps

  it('is the same in every working week', () => {
    const weeks = [0, 1, 2, 3, 4, 5].map(() =>
      weeklyTargetForWeek(DEFAULT_MUSCLE_TIERS, 'biceps', biceps, false),
    )

    expect(new Set(weeks).size).toBe(1)
  })

  it('is the target the priority asked for, with no week-dependent discount', () => {
    expect(weeklyTargetForWeek(DEFAULT_MUSCLE_TIERS, 'biceps', biceps, false)).toBe(
      weeklyTargetForMember(DEFAULT_MUSCLE_TIERS, 'biceps', biceps),
    )
  })

  it('never overreaches past maximum recoverable volume', () => {
    const peak = weeklyTargetForWeek([tier(1, ['biceps'])], 'biceps', biceps, false)

    // The ramp used to spend its last working week above MAV and touch
    // MRV exactly once. Flat means the ceiling is the ceiling: the top
    // of the band is where a specialised muscle sits all block, and
    // nothing is left to climb into.
    expect(peak).toBeLessThanOrEqual(biceps.mrv)
  })

  it('drops to maintenance on the deload', () => {
    expect(weeklyTargetForWeek(DEFAULT_MUSCLE_TIERS, 'biceps', biceps, true)).toBe(biceps.mv)
  })

  it('keeps a deprioritised muscle near maintenance', () => {
    const calves = DEFAULT_LANDMARKS.calves

    const weeks = [0, 2, 5].map(() =>
      weeklyTargetForWeek(DEFAULT_MUSCLE_TIERS, 'quads', calves, false),
    )

    for (const target of weeks) {
      expect(target).toBeLessThan(calves.mav)
    }
  })

  /*
   * The ask is bounded by the week that has to deliver it.
   *
   * A tier buys a frequency and a session holds five direct sets, so a
   * tier-2 muscle can be handed ten sets and no more however high its
   * landmarks reach. Without this the tier editor promised thirteen, the
   * assembler delivered ten, and the Plan screen reported the difference
   * as a capacity problem — three sets a lifter could not have found
   * anywhere, because they did not exist.
   */
  it('never asks for more volume than the tier’s frequency can deliver', () => {
    const sideDelts = DEFAULT_LANDMARKS['side-delts']
    const tiers: MuscleTiers = [tier(1, []), tier(2, ['side-delts']), tier(3, [])]

    expect(weeklyTargetForMember(tiers, 'side-delts', sideDelts)).toBeLessThanOrEqual(
      reachableWeeklySets(2),
    )
    expect(reachableWeeklySets(2)).toBe(MAX_DIRECT_SETS_PER_SESSION * 2)
  })
})

describe('validation', () => {
  it('rejects an empty tier list', () => {
    expect(() => {
      validateTiers([])
    }).toThrow(/at least one tier/)
  })

  it('rejects duplicate ranks', () => {
    expect(() => {
      validateTiers([tier(1, ['chest']), tier(1, ['lats'])])
    }).toThrow(/share the same rank/)
  })

  it('rejects a muscle placed in two tiers', () => {
    expect(() => {
      validateTiers([tier(1, ['chest']), tier(2, ['chest', 'lats'])])
    }).toThrow(/more than one tier/)
  })

  it('accepts the seeded defaults', () => {
    expect(() => {
      validateTiers(DEFAULT_MUSCLE_TIERS)
    }).not.toThrow()
  })
})

describe('every muscle has a tier', () => {
  /*
   * The compiler cannot check this, which is why it is here.
   *
   * `MUSCLE_GROUP_LABELS` and `DEFAULT_LANDMARKS` are `Record<MuscleGroup,
   * …>`, so adding a muscle group fails the build until both are filled
   * in. Tiers are an *array*, so a new group simply belongs to no tier and
   * nothing complains — which is what happened when `traps` was split out
   * of `upper-back`: typecheck passed, and the muscle silently fell to the
   * bottom position with no tier to explain it on any screen.
   */
  it('places every muscle group in exactly one tier', () => {
    const placed = DEFAULT_MUSCLE_TIERS.flatMap((tier) => tier.members)

    expect([...placed].sort()).toEqual([...MUSCLE_GROUPS].sort())
  })

  it('gives every muscle group landmarks', () => {
    for (const muscle of MUSCLE_GROUPS) {
      expect(DEFAULT_LANDMARKS[muscle], muscle).toBeDefined()
    }
  })
})

describe('tiers saved before a muscle existed', () => {
  const saved = [
    { rank: 1, members: ['biceps'], label: 'Specialising' },
    { rank: 2, members: ['lats'], label: 'Building' },
    { rank: 3, members: ['calves'], label: 'Maintaining' },
  ]

  it('drops an unknown muscle into the bottom tier', () => {
    const completed = completeTiers(saved, ['biceps', 'lats', 'calves', 'traps'])

    expect(completed.find((tier) => tier.rank === 3)?.members).toContain('traps')
  })

  it('leaves the lifter’s own choices alone', () => {
    const completed = completeTiers(saved, ['biceps', 'lats', 'calves', 'traps'])

    expect(completed.find((tier) => tier.rank === 1)?.members).toEqual(['biceps'])
    expect(completed.find((tier) => tier.rank === 2)?.members).toEqual(['lats'])
  })

  it('returns the same list when nothing is missing', () => {
    // Identity, so a read that changes nothing does not look like a write.
    expect(completeTiers(saved, ['biceps', 'lats', 'calves'])).toBe(saved)
  })
})
