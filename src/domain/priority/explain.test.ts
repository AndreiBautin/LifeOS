import { describe, expect, it } from 'vitest'

import { DEFAULT_MUSCLE_TIERS, DEFAULT_STRENGTH_TIERS } from '@/domain/priority/tiers'
import { DEFAULT_LANDMARKS } from '@/domain/volume/landmarks'

import { describeBlock, explainVolume } from './explain'

/**
 * The description is the one thing in the app a lifter cannot check.
 *
 * Every other number has a session or a bar behind it. A sentence saying
 * "everything else maintained" can be wrong for months without anything
 * contradicting it, which is why it is generated rather than written.
 */

describe('naming a block from its tiers', () => {
  it('names it after what is actually specialised', () => {
    const described = describeBlock(DEFAULT_MUSCLE_TIERS, DEFAULT_STRENGTH_TIERS)

    expect(described.name).toBe('RP block — arms and side delts')
  })

  it('follows a tier when it moves', () => {
    // The failure this replaces: the block went on calling itself an arms
    // specialisation after the arms had been moved down.
    const chestFocus = describeBlock(
      [
        { rank: 1, members: ['chest'], label: 'Specialising' },
        { rank: 2, members: ['triceps'], label: 'Building' },
        { rank: 3, members: ['biceps'], label: 'Maintaining' },
      ],
      DEFAULT_STRENGTH_TIERS,
    )

    expect(chestFocus.name).toBe('RP block — chest')
    expect(chestFocus.description).toContain('Chest specialised.')
    expect(chestFocus.description).toContain('Triceps building.')
    expect(chestFocus.description).toContain('Biceps maintained.')
  })

  it('collapses a full muscle group into one word', () => {
    const armsAndLegs = describeBlock(
      [{ rank: 1, members: ['biceps', 'triceps', 'forearms'], label: 'Specialising' }],
      DEFAULT_STRENGTH_TIERS,
    )

    expect(armsAndLegs.name).toBe('RP block — arms')
  })

  it('does not collapse a partial group', () => {
    // Prioritising biceps alone is not prioritising arms, and saying so
    // would misdescribe the block in the direction of flattery.
    const bicepsOnly = describeBlock(
      [{ rank: 1, members: ['biceps', 'triceps'], label: 'Specialising' }],
      DEFAULT_STRENGTH_TIERS,
    )

    expect(bicepsOnly.name).toBe('RP block — biceps and triceps')
  })

  it('names the lift leading the strength work', () => {
    const described = describeBlock(DEFAULT_MUSCLE_TIERS, DEFAULT_STRENGTH_TIERS)

    expect(described.description).toContain('Bench press leads the strength work.')
  })
})

describe('explaining the volume', () => {
  const plan = explainVolume(DEFAULT_MUSCLE_TIERS, DEFAULT_STRENGTH_TIERS, DEFAULT_LANDMARKS)

  it('gives every muscle a reason naming its inputs', () => {
    for (const muscle of plan.muscles) {
      expect(muscle.reason, muscle.label).toMatch(/Tier \d of \d/)
      expect(muscle.reason).toContain('hard sets a week')
    }
  })

  it('reports the target inside the muscle’s own landmark band', () => {
    for (const muscle of plan.muscles) {
      expect(muscle.weeklySets, muscle.label).toBeLessThanOrEqual(muscle.landmarks.mrv)
      expect(muscle.weeklySets, muscle.label).toBeGreaterThanOrEqual(muscle.landmarks.mv)
    }
  })

  it('describes a middle-tier lift as building rather than maintained', () => {
    // Two tiers only offered "grow this" and "hold that", and holding is
    // not what anybody wants from a squat.
    const squat = plan.lifts.find((lift) => lift.lift === 'squat')

    expect(squat?.tier).toBe(2)
    expect(squat?.reason).toMatch(/^Building/)
  })
})
