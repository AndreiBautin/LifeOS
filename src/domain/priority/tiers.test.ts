import { describe, expect, it } from 'vitest'

import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { DEFAULT_LANDMARKS } from '@/domain/volume/landmarks'

import {
  DEFAULT_MUSCLE_TIERS,
  priorityPosition,
  spreadFactor,
  validateTiers,
  weeklyTargetFor,
  weeklyTargetForWeek,
  type MuscleTiers,
} from './tiers'

const tier = (rank: number, members: MuscleGroup[]) => ({ rank, members })

describe('the spread factor', () => {
  it('is high when a small top tier is subsidised by everything else', () => {
    const concentrated: MuscleTiers = [
      tier(1, ['biceps', 'side-delts']),
      tier(2, ['chest', 'lats', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'triceps']),
    ]

    expect(spreadFactor(concentrated)).toBeGreaterThan(0.75)
  })

  it('falls when the top tier holds half the roster', () => {
    const crowded: MuscleTiers = [
      tier(1, ['biceps', 'triceps', 'chest', 'lats', 'quads']),
      tier(2, ['hamstrings', 'glutes', 'calves', 'core']),
    ]

    // Prioritising five of nine is not a priority call, so the mapping
    // should refuse to treat it like one.
    expect(spreadFactor(crowded)).toBeLessThan(spreadFactor(DEFAULT_MUSCLE_TIERS))
  })

  it('is zero when a single tier holds everything', () => {
    // One tier expresses no preference; the mapping should express none.
    expect(spreadFactor([tier(1, ['chest', 'lats', 'quads'])])).toBe(0)
  })

  it('is zero for an empty roster rather than dividing by zero', () => {
    expect(spreadFactor([])).toBe(0)
    expect(spreadFactor([tier(1, [])])).toBe(0)
  })

  it('rewards a considered multi-tier ordering over a binary one', () => {
    const binary: MuscleTiers = [tier(1, ['biceps']), tier(2, ['chest', 'lats', 'quads'])]
    const graded: MuscleTiers = [
      tier(1, ['biceps']),
      tier(2, ['chest']),
      tier(3, ['lats']),
      tier(4, ['quads']),
    ]

    expect(spreadFactor(graded)).toBeGreaterThan(spreadFactor(binary))
  })
})

describe('priority position', () => {
  it('puts the top tier high and the bottom tier low', () => {
    const top = priorityPosition(DEFAULT_MUSCLE_TIERS, 'triceps')
    const middle = priorityPosition(DEFAULT_MUSCLE_TIERS, 'chest')
    const bottom = priorityPosition(DEFAULT_MUSCLE_TIERS, 'calves')

    expect(top).toBeGreaterThan(middle)
    expect(middle).toBeGreaterThan(bottom)
    expect(top).toBeGreaterThan(0.5)
    expect(bottom).toBeLessThan(0.5)
  })

  it('treats every member of a tier identically', () => {
    // Triceps, forearms and side delts share tier 1 and must come out
    // the same. The biceps sit a tier below — see DEFAULT_MUSCLE_TIERS.
    const positions = (['triceps', 'forearms', 'side-delts'] as const).map((muscle) =>
      priorityPosition(DEFAULT_MUSCLE_TIERS, muscle),
    )

    expect(new Set(positions).size).toBe(1)
  })

  it('compresses toward the middle when priority is spread thin', () => {
    const concentrated: MuscleTiers = [
      tier(1, ['biceps']),
      tier(2, ['chest', 'lats', 'quads', 'hamstrings', 'glutes', 'calves']),
    ]
    const crowded: MuscleTiers = [
      tier(1, ['biceps', 'chest', 'lats', 'quads']),
      tier(2, ['hamstrings', 'glutes', 'calves']),
    ]

    expect(priorityPosition(concentrated, 'biceps')).toBeGreaterThan(
      priorityPosition(crowded, 'biceps'),
    )
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

describe('ramping into position across a block', () => {
  const biceps = DEFAULT_LANDMARKS.biceps
  const position = priorityPosition(DEFAULT_MUSCLE_TIERS, 'biceps')

  it('starts near the minimum effective volume rather than at the ceiling', () => {
    const week1 = weeklyTargetForWeek(biceps, position, 0, 6, false)

    // Starting at the top wastes the block's most productive weeks on
    // volume you were already adapted to.
    expect(week1).toBeLessThanOrEqual(biceps.mev)
  })

  it('climbs monotonically to the peak in the last working week', () => {
    const weeks = [0, 1, 2, 3, 4, 5].map((week) =>
      weeklyTargetForWeek(biceps, position, week, 6, false),
    )

    expect(weeks).toEqual([...weeks].sort((a, b) => a - b))
    expect(weeks[5]).toBeGreaterThan(weeks[0] ?? 0)
  })

  it('touches maximum recoverable volume only in the final week before a deload', () => {
    const overreach = weeklyTargetForWeek(biceps, 1, 5, 6, false)
    const earlier = weeklyTargetForWeek(biceps, 1, 4, 6, false)

    expect(overreach).toBe(biceps.mrv)
    expect(earlier).toBeLessThan(biceps.mrv)
  })

  it('drops to maintenance on the deload', () => {
    expect(weeklyTargetForWeek(biceps, position, 6, 6, true)).toBe(biceps.mv)
  })

  it('keeps a deprioritised muscle near maintenance throughout', () => {
    const calves = DEFAULT_LANDMARKS.calves
    const low = priorityPosition(DEFAULT_MUSCLE_TIERS, 'calves')

    const weeks = [0, 2, 5].map((week) => weeklyTargetForWeek(calves, low, week, 6, false))

    for (const target of weeks) {
      expect(target).toBeLessThan(calves.mav)
    }
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
