import { describe, expect, it } from 'vitest'

import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'
import { MAX_DIRECT_SETS_PER_SESSION, reachableWeeklySets } from '@/domain/volume/frequency'
import { DEFAULT_LANDMARKS, STARTING_LANDMARKS } from '@/domain/volume/landmarks'

import {
  completeTiers,
  DEFAULT_MUSCLE_TIERS,
  validateTiers,
  weeklyTargetForMember,
  weeklyTargetForWeek,
  type MuscleTiers,
} from './tiers'

const tier = (rank: number, members: MuscleGroup[]) => ({ rank, members })

const marks = STARTING_LANDMARKS

/*
 * Three tiers, three answers, and nothing in between them.
 *
 * This file used to test an interpolation: a tier chose a position
 * between 0 and 1, the position was lerped through four landmark anchors,
 * and the result was clamped to what the tier's frequency could deliver.
 * Twenty tests covered the arithmetic — monotonicity, where MEV fell,
 * what an empty tier did to the ordering — and every one of them was
 * about machinery rather than about training.
 *
 * There is no arithmetic left to test. What is worth pinning is that the
 * three answers are the three landmarks, that they cannot be reached by
 * any other route, and the two things the old machinery got right and a
 * lookup could plausibly get wrong: a muscle's target must not depend on
 * any other muscle, and the deload must ignore the tier list entirely.
 */
describe('what a tier is worth', () => {
  const tiers: MuscleTiers = [tier(1, ['chest']), tier(2, ['lats']), tier(3, ['calves'])]

  it('gives the top tier maximum recoverable volume', () => {
    expect(weeklyTargetForMember(tiers, 'chest', marks)).toBe(marks.mrv)
  })

  it('gives the middle tier minimum effective volume', () => {
    expect(weeklyTargetForMember(tiers, 'lats', marks)).toBe(marks.mev)
  })

  it('gives the bottom tier no dedicated work at all', () => {
    // Zero, not "a little". A maintained muscle lives on what the
    // competition lifts pay it, which for the quads and glutes is well
    // past this and for the trunk is nothing.
    expect(weeklyTargetForMember(tiers, 'calves', marks)).toBe(0)
  })

  it('puts an untiered muscle at the bottom rather than erroring', () => {
    // A new muscle group should not break a program.
    expect(weeklyTargetForMember(tiers, 'core', marks)).toBe(0)
  })

  it('treats every member of a tier identically', () => {
    const members: MuscleGroup[] = ['lats', 'biceps', 'calves']
    const shared: MuscleTiers = [tier(1, []), tier(2, members), tier(3, [])]

    const targets = members.map((muscle) => weeklyTargetForMember(shared, muscle, marks))

    expect(new Set(targets).size).toBe(1)
  })
})

/*
 * The property a `spreadFactor` used to destroy, kept because the
 * temptation that produced it is perennial.
 *
 * It scaled every target by how crowded the top tier was — sound
 * reasoning, since prioritising eight things is not prioritising — and it
 * made every target depend on every other muscle's placement. Moving the
 * biceps out of tier 1 silently raised the side delts. A lifter could not
 * state "these four matter to me" without the app renegotiating it.
 *
 * A lookup makes this almost impossible to break, which is exactly when a
 * guard is worth keeping: the next version of the idea will arrive as a
 * reasonable-sounding suggestion, not as a bug.
 */
describe('a muscle tier changes that muscle and nothing else', () => {
  const base: MuscleTiers = [tier(1, ['side-delts']), tier(2, ['chest']), tier(3, ['calves'])]
  const crowded: MuscleTiers = [
    tier(1, ['side-delts', 'biceps', 'triceps', 'forearms']),
    tier(2, ['chest']),
    tier(3, ['calves']),
  ]

  it('leaves the top tier untouched when three more muscles join it', () => {
    expect(weeklyTargetForMember(crowded, 'side-delts', marks)).toBe(
      weeklyTargetForMember(base, 'side-delts', marks),
    )
  })

  it('leaves the lower tiers untouched too', () => {
    expect(weeklyTargetForMember(crowded, 'chest', marks)).toBe(
      weeklyTargetForMember(base, 'chest', marks),
    )
    expect(weeklyTargetForMember(crowded, 'calves', marks)).toBe(
      weeklyTargetForMember(base, 'calves', marks),
    )
  })

  it('gives a newly promoted muscle the same target as the rest of its tier', () => {
    expect(weeklyTargetForMember(crowded, 'biceps', marks)).toBe(
      weeklyTargetForMember(crowded, 'side-delts', marks),
    )
  })

  /*
   * An empty tier is not a missing one. Emptying tier 1 must not promote
   * tier 2 into its place — that bug was live for a while, and it handed
   * tier 2 a top-of-band target while the frequency table still bought it
   * two sessions, so the ask was three sets larger than anything could
   * deliver.
   */
  it('does not promote a lower tier when the one above it is emptied', () => {
    const emptied: MuscleTiers = [tier(1, []), tier(2, ['lats']), tier(3, [])]
    const populated: MuscleTiers = [tier(1, ['chest']), tier(2, ['lats']), tier(3, [])]

    expect(weeklyTargetForMember(emptied, 'lats', marks)).toBe(
      weeklyTargetForMember(populated, 'lats', marks),
    )
    expect(weeklyTargetForMember(emptied, 'lats', marks)).toBe(marks.mev)
  })
})

describe('the target, week by week', () => {
  it('is the same in every working week', () => {
    const weeks = [0, 1, 2, 3, 4, 5].map(() =>
      weeklyTargetForWeek(DEFAULT_MUSCLE_TIERS, 'biceps', marks, false),
    )

    expect(new Set(weeks).size).toBe(1)
  })

  it('is the target the priority asked for, with no week-dependent discount', () => {
    expect(weeklyTargetForWeek(DEFAULT_MUSCLE_TIERS, 'biceps', marks, false)).toBe(
      weeklyTargetForMember(DEFAULT_MUSCLE_TIERS, 'biceps', marks),
    )
  })

  /*
   * The deload ignores the tier list, and that is the point of it.
   *
   * Every muscle drops to MV whatever its tier — a deload is a week off
   * from the priority ordering rather than a scaled-down version of it —
   * so a tier-1 muscle and a tier-3 one get the same two sets.
   */
  it('drops everything to maintenance on the deload, whatever its tier', () => {
    const tiers: MuscleTiers = [tier(1, ['chest']), tier(2, ['lats']), tier(3, ['calves'])]

    for (const muscle of ['chest', 'lats', 'calves'] as const) {
      expect(weeklyTargetForWeek(tiers, muscle, marks, true), muscle).toBe(marks.mv)
    }
  })

  /*
   * The ask is bounded by the sessions that have to deliver it.
   *
   * Reads as redundant against the shipped numbers — tier 1 asks for MRV,
   * MRV is ten, two sessions of five is ten — and it is not, because the
   * check-in loop raises MRV. Without this the target follows it past
   * anything two sessions can hold and sits on the Plan screen as a
   * shortfall nobody can close.
   */
  it('never asks for more volume than the tier’s sessions can deliver', () => {
    const raised = { ...marks, mrv: 40, mav: 30 }
    const tiers: MuscleTiers = [tier(1, ['side-delts']), tier(2, []), tier(3, [])]

    expect(weeklyTargetForMember(tiers, 'side-delts', raised)).toBe(reachableWeeklySets(1))
    expect(reachableWeeklySets(1)).toBe(MAX_DIRECT_SETS_PER_SESSION * 2)
  })
})

/*
 * One set of numbers, the same for every muscle.
 *
 * The per-muscle table is gone and this is what replaced it. Worth a test
 * because the flatness is the simplification: if a future edit reintroduces
 * per-muscle numbers it should be a deliberate act with its own reasoning,
 * not something that creeps back in one muscle at a time.
 */
describe('the starting landmarks', () => {
  it('are two, six and ten', () => {
    expect(STARTING_LANDMARKS.mv).toBe(2)
    expect(STARTING_LANDMARKS.mev).toBe(6)
    expect(STARTING_LANDMARKS.mrv).toBe(10)
  })

  it('are the same for every muscle group', () => {
    for (const muscle of MUSCLE_GROUPS) {
      expect(DEFAULT_LANDMARKS[muscle], muscle).toEqual(STARTING_LANDMARKS)
    }
  })

  /*
   * A tier-2 muscle gets three sets a session and a tier-1 muscle five,
   * which are exactly the slot floor and the slot ceiling. Not a
   * coincidence and worth pinning: with one exercise per muscle per
   * session, the tier is choosing which end of the 3–5 range that
   * exercise sits at, and numbers that drifted out of step would leave a
   * tier asking for a slot the fill cannot build.
   */
  it('divide into whole slots at both tiers', () => {
    expect(STARTING_LANDMARKS.mev / 2).toBe(3)
    expect(STARTING_LANDMARKS.mrv / 2).toBe(MAX_DIRECT_SETS_PER_SESSION)
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
