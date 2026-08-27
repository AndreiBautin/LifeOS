import { describe, expect, it } from 'vitest'

import { liftsDivergeFrom, musclesDivergeFrom } from '@/domain/priority/divergence'
import { DEFAULT_LIFT_SESSIONS } from '@/domain/priority/tiers'
import type { MuscleVolumes } from '@/domain/volume/levels'
import { DEFAULT_MUSCLE_VOLUMES } from '@/domain/volume/levels'

/*
 * Settings are the lifter's own and nothing overwrites them, which
 * quietly means a choice saved months ago goes on being used after the
 * shipped defaults have moved underneath it. Naming the divergence is the
 * whole fix; resolving it stays a decision.
 */
describe('divergence from the shipped defaults', () => {
  it('finds nothing when the settings are the defaults', () => {
    expect(musclesDivergeFrom(DEFAULT_MUSCLE_VOLUMES, DEFAULT_MUSCLE_VOLUMES)).toHaveLength(0)
    expect(liftsDivergeFrom(DEFAULT_LIFT_SESSIONS, DEFAULT_LIFT_SESSIONS)).toBe(false)
  })

  it('names a muscle trained a different number of times', () => {
    const mine: MuscleVolumes = {
      ...DEFAULT_MUSCLE_VOLUMES,
      calves: { ...DEFAULT_MUSCLE_VOLUMES.calves, sessionsPerWeek: 1 },
    }

    expect(musclesDivergeFrom(mine, DEFAULT_MUSCLE_VOLUMES)).toEqual(['calves'])
  })

  /*
   * A level change counts too. Same frequency and a different dose is a
   * different week, and reporting only frequency would call it identical.
   */
  it('names a muscle trained at a different level', () => {
    const mine: MuscleVolumes = {
      ...DEFAULT_MUSCLE_VOLUMES,
      chest: { ...DEFAULT_MUSCLE_VOLUMES.chest, level: 'high' },
    }

    expect(musclesDivergeFrom(mine, DEFAULT_MUSCLE_VOLUMES)).toEqual(['chest'])
  })

  it('reports a lift trained a different number of times', () => {
    expect(liftsDivergeFrom({ ...DEFAULT_LIFT_SESSIONS, bench: 3 }, DEFAULT_LIFT_SESSIONS)).toBe(
      true,
    )
  })
})
