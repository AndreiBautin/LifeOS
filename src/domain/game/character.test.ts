import { describe, expect, it } from 'vitest'

import { asExerciseId } from '@/domain/ids/ids'

import {
  buildCharacter,
  levelFromXp,
  placeOnLadder,
  TOTAL_STANDARDS,
  xpForLevel,
} from './character'

/**
 * The scale has to be real, or the whole thing is decoration.
 *
 * These assert against the published standards rather than against
 * whatever the code currently produces: a level that moved because an
 * implementation detail changed would be the app quietly redefining what
 * "Advanced" means.
 */

describe('placing a value on a ladder', () => {
  const thresholds = [1, 2, 3, 4, 5]

  it('interpolates between rungs rather than snapping', () => {
    // Halfway from Novice (2) to Intermediate (3).
    const placed = placeOnLadder(2.5, thresholds)

    expect(placed.level).toBe('Novice')
    expect(placed.progress).toBeCloseTo(0.5)
  })

  it('reports partial progress below the first rung', () => {
    expect(placeOnLadder(0.5, thresholds).level).toBe('Untrained')
    expect(placeOnLadder(0.5, thresholds).progress).toBeCloseTo(0.5)
  })

  it('caps at the top rather than running off the end', () => {
    const placed = placeOnLadder(99, thresholds)

    expect(placed.level).toBe('Elite')
    expect(placed.progress).toBe(1)
  })
})

describe('XP', () => {
  it('grows quadratically, so later levels cost a block of training', () => {
    expect(xpForLevel(2) - xpForLevel(1)).toBeLessThan(xpForLevel(10) - xpForLevel(9))
  })

  it('reports how far into the current level a total sits', () => {
    const at = levelFromXp(xpForLevel(4))

    expect(at.level).toBe(4)
    expect(at.into).toBe(0)
    expect(at.needed).toBe(xpForLevel(5) - xpForLevel(4))
  })
})

describe('the character sheet', () => {
  const base = {
    estimatedMaxes: {
      [asExerciseId('low-bar-squat')]: 303,
      [asExerciseId('bench-press')]: 228,
      [asExerciseId('sumo-deadlift')]: 368,
    },
    bodyweight: 183,
    sessions: 64,
    workingSets: 900,
  }

  it('totals the three competition lifts and nothing else', () => {
    const character = buildCharacter({
      ...base,
      estimatedMaxes: { ...base.estimatedMaxes, [asExerciseId('overhead-press')]: 152 },
    })

    // The press is trained but is not part of a total.
    expect(character.total).toBe(899)
  })

  it('places the total against published standards', () => {
    const character = buildCharacter(base)

    // 899 / 183 = 4.91x bodyweight. The intermediate rung is 4.75 and
    // the advanced one 6.5, so this sits early in Intermediate.
    expect(TOTAL_STANDARDS).toEqual([2.25, 3.5, 4.75, 6.5, 7.75])
    expect(character.totalAttribute.level).toBe('Intermediate')
    expect(character.totalAttribute.next?.needed).toBe(Math.round(6.5 * 183))
  })

  it('says what is missing rather than inventing a level', () => {
    // Standards are bodyweight multiples, so without a bodyweight there
    // is no honest answer — and guessing one would misreport how strong
    // somebody is.
    const { bodyweight: _omitted, ...withoutBodyweight } = base
    const character = buildCharacter(withoutBodyweight)

    expect(character.total).toBeUndefined()
    expect(character.lifts[0]?.detail).toMatch(/bodyweight/i)
  })

  it('never lets XP raise a strength level', () => {
    const grinder = buildCharacter({ ...base, sessions: 5000, workingSets: 100000 })
    const fresh = buildCharacter(base)

    expect(grinder.xpLevel).toBeGreaterThan(fresh.xpLevel)
    expect(grinder.totalAttribute.level).toBe(fresh.totalAttribute.level)
  })
})

describe('a lifter who has just installed the app', () => {
  it('opens at zero XP rather than at a negative number', () => {
    // Squaring the level itself put the floor of level 1 above the XP a
    // new lifter has, and the bar rendered "-100 / 300".
    const fresh = levelFromXp(0)

    expect(fresh.level).toBe(1)
    expect(fresh.into).toBe(0)
    expect(fresh.needed).toBeGreaterThan(0)
  })

  it('never reports negative progress at any level', () => {
    for (const xp of [0, 1, 99, 100, 101, 5000, 250000]) {
      const at = levelFromXp(xp)
      expect(at.into, `XP ${String(xp)}`).toBeGreaterThanOrEqual(0)
      expect(at.into).toBeLessThan(at.needed)
    }
  })
})
