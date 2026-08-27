import { describe, expect, it } from 'vitest'

import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'
import type { LiftSessions } from '@/domain/priority/tiers'
import { DEFAULT_LIFT_SESSIONS } from '@/domain/priority/tiers'
import type { MuscleVolumes, VolumeLevel } from '@/domain/volume/levels'
import { DEFAULT_MUSCLE_VOLUMES, DEFAULT_SETS_PER_SESSION } from '@/domain/volume/levels'

import { describeBlock, explainVolume } from './explain'

/**
 * The description is the one thing in the app a lifter cannot check.
 *
 * Every other number has a session or a bar behind it. A sentence saying
 * "everything else is left to the competition lifts" can be wrong for
 * months without anything contradicting it, which is why it is generated
 * rather than written.
 */

const sets = DEFAULT_SETS_PER_SESSION

/** A volume map with only the named muscles trained. */
const only = (
  members: readonly MuscleGroup[],
  sessionsPerWeek = 2,
  level: VolumeLevel = 'low',
): MuscleVolumes =>
  Object.fromEntries(
    MUSCLE_GROUPS.map((muscle) => [
      muscle,
      members.includes(muscle) ? { sessionsPerWeek, level } : { sessionsPerWeek: 0, level: 'low' },
    ]),
  ) as MuscleVolumes

const evenLifts: LiftSessions = { squat: 2, bench: 2, deadlift: 2 }
const benchLed: LiftSessions = { squat: 1, bench: 3, deadlift: 1 }

describe('naming a block from its settings', () => {
  /*
   * The shipped settings train eight muscles identically, so nothing
   * stands out and the block is general — it says so rather than listing
   * all eight as though that were a name.
   *
   * Reads the defaults back, so it fails when they move. That is the
   * point: the name is the one line describing them and nobody would
   * otherwise notice it had gone stale.
   */
  it('names it after what actually stands out', () => {
    const described = describeBlock(DEFAULT_MUSCLE_VOLUMES, sets, DEFAULT_LIFT_SESSIONS)

    expect(described.name).toBe('General')
    expect(described.description).toContain('at low volume.')
    expect(described.description).toContain('left to the competition lifts.')
  })

  it('claims no lead lift when every lift is trained the same', () => {
    const described = describeBlock(DEFAULT_MUSCLE_VOLUMES, sets, DEFAULT_LIFT_SESSIONS)

    expect(described.description).not.toContain('leads the strength work')
    expect(described.focus.lifts).toBeUndefined()
  })

  /*
   * The focus is whatever gets the most weekly sets, which is a real
   * change of meaning from "what is in tier 1" and a better one: a lifter
   * who trains their chest twice as hard has emphasised it whether or not
   * they ever opened a tier list.
   */
  it('follows the emphasis when it moves', () => {
    const volumes: MuscleVolumes = {
      ...only(['chest', 'lats']),
      chest: { sessionsPerWeek: 3, level: 'high' },
    }

    const described = describeBlock(volumes, sets, benchLed)

    expect(described.name).toBe('Chest · Bench press strength')
    expect(described.description).toContain('Chest at high volume.')
    expect(described.description).toContain('Lats at low volume.')
  })

  it('collapses a full muscle group into one word', () => {
    const volumes: MuscleVolumes = {
      ...only(['biceps', 'triceps', 'forearms', 'chest']),
      biceps: { sessionsPerWeek: 3, level: 'high' },
      triceps: { sessionsPerWeek: 3, level: 'high' },
      forearms: { sessionsPerWeek: 3, level: 'high' },
    }

    expect(describeBlock(volumes, sets, benchLed).name).toBe('Arms · Bench press strength')
  })

  it('does not collapse a partial group', () => {
    // Emphasising biceps alone is not emphasising arms, and saying so
    // would misdescribe the block in the direction of flattery.
    const volumes: MuscleVolumes = {
      ...only(['biceps', 'triceps', 'chest']),
      biceps: { sessionsPerWeek: 3, level: 'high' },
      triceps: { sessionsPerWeek: 3, level: 'high' },
    }

    // Named in taxonomy order, which puts the triceps first — the list
    // is generated from MUSCLE_GROUPS rather than from the tier list a
    // lifter typed, so it does not carry their ordering.
    expect(describeBlock(volumes, sets, benchLed).name).toBe(
      'Triceps and biceps · Bench press strength',
    )
  })

  it('names the lift leading the strength work', () => {
    expect(describeBlock(DEFAULT_MUSCLE_VOLUMES, sets, benchLed).description).toContain(
      'Bench press leads the strength work.',
    )
  })

  /*
   * A block has two focuses and the title used to carry one. Two blocks
   * with identical volume, one leading with the bench and one with the
   * deadlift, are different blocks and were indistinguishable by name.
   */
  it('carries the strength focus in the title, not only the volume focus', () => {
    const volumes: MuscleVolumes = {
      ...only(['chest', 'lats']),
      chest: { sessionsPerWeek: 3, level: 'high' },
    }

    const bench = describeBlock(volumes, sets, benchLed)
    const deadlift = describeBlock(volumes, sets, { squat: 1, bench: 1, deadlift: 3 })

    expect(bench.name).toBe('Chest · Bench press strength')
    expect(deadlift.name).toBe('Chest · Deadlift strength')
  })

  it('names every lead lift when more than one leads', () => {
    const twoLifts = describeBlock(DEFAULT_MUSCLE_VOLUMES, sets, {
      squat: 3,
      bench: 1,
      deadlift: 3,
    })

    expect(twoLifts.name).toContain('Squat and deadlift strength')
  })

  it('falls back to the volume focus alone when no lift leads', () => {
    const volumes: MuscleVolumes = {
      ...only(['chest', 'lats']),
      chest: { sessionsPerWeek: 3, level: 'high' },
    }

    expect(describeBlock(volumes, sets, evenLifts).name).toBe('Chest')
  })
})

describe('explaining the volume', () => {
  const plan = explainVolume(DEFAULT_MUSCLE_VOLUMES, sets, DEFAULT_LIFT_SESSIONS)

  it('gives every muscle a reason naming its inputs', () => {
    for (const muscle of plan.muscles) {
      expect(muscle.reason, muscle.label).toMatch(/sessions a week|Not trained directly/)
    }
  })

  /*
   * Weekly sets are sessions times sets per session and nothing else.
   * Asserted against the settings rather than against a constant, so the
   * arithmetic is what is under test rather than today's defaults.
   */
  it('reports weekly sets as the two settings multiplied', () => {
    for (const muscle of plan.muscles) {
      expect(muscle.weeklySets, muscle.label).toBe(muscle.sessionsPerWeek * muscle.setsPerSession)
    }
  })

  it('reports a muscle with no sessions as getting nothing', () => {
    for (const muscle of plan.muscles) {
      if (muscle.sessionsPerWeek > 0) continue

      expect(muscle.weeklySets, muscle.label).toBe(0)
      expect(muscle.band, muscle.label).toBe('maintaining')
    }
  })

  it('counts only the muscles that get dedicated work', () => {
    expect(plan.trainedCount).toBe(plan.muscles.filter((entry) => entry.weeklySets > 0).length)
    expect(plan.totalWeeklySets).toBe(
      plan.muscles.reduce((total, entry) => total + entry.weeklySets, 0),
    )
  })

  it('describes a lift that is not trained at all', () => {
    const none = explainVolume(DEFAULT_MUSCLE_VOLUMES, sets, { squat: 0, bench: 2, deadlift: 2 })
    const squat = none.lifts.find((lift) => lift.lift === 'squat')

    expect(squat?.sessionsPerWeek).toBe(0)
    expect(squat?.reason).toBe('Not trained this block.')
  })
})
