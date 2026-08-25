import { describe, expect, it } from 'vitest'

import { deriveProgram } from '@/application/use-cases/programs/current-program'
import { builtInExercises } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { sumVolume, volumeForSlots } from '@/domain/volume/accounting'

import { attributeWeek } from './attribution'

/**
 * The breakdown has to agree with the total it explains.
 *
 * A per-exercise attribution that disagrees with the volume map is worse
 * than none: it invites the lifter to trust the derivation and then hands
 * them different arithmetic from the one the planner used.
 */

const library = builtInExercises()
const lookup = (id: ExerciseId): Exercise | undefined =>
  library.find((exercise) => exercise.id === id)

const program = deriveProgram(DEFAULT_SETTINGS, library)
const week = program.blocks[0]?.weeks[5]
if (week === undefined) throw new Error('expected a working week')

const attribution = attributeWeek(week, lookup)

describe('attributing a week', () => {
  it('totals exactly what the volume map totals, muscle for muscle', () => {
    const counted = sumVolume(
      week.days.map((day) =>
        volumeForSlots(
          day.slots.flatMap((slot) =>
            slot.exercise.kind === 'specific'
              ? [{ exerciseId: slot.exercise.exerciseId, sets: slot.sets }]
              : [],
          ),
          lookup,
        ),
      ),
    )

    for (const entry of attribution) {
      expect(entry.total, entry.label).toBeCloseTo(counted[entry.muscle], 1)
    }
  })

  it('counts a direct set whole and an indirect one at a half', () => {
    // The arithmetic a lifter cannot see from the session list, and the
    // reason a total can land on a half. Triceps is the clearest case:
    // one exercise trains them directly and four pay them a fraction.
    const triceps = attribution.find((entry) => entry.muscle === 'triceps')
    const primary = triceps?.contributions.find((entry) => entry.kind === 'primary')
    const secondary = triceps?.contributions.filter((entry) => entry.kind === 'secondary') ?? []

    expect(primary?.counted).toBe(primary?.sets)
    expect(secondary.length).toBeGreaterThan(0)

    for (const contribution of secondary) {
      expect(contribution.counted, contribution.name).toBe(contribution.sets * 0.5)
    }
  })

  it('adds the fractions up to the muscle total', () => {
    // The whole point: the parts must equal the number they explain.
    for (const entry of attribution) {
      const summed = entry.contributions.reduce((total, one) => total + one.counted, 0)
      expect(summed, entry.label).toBeCloseTo(entry.total, 1)
    }
  })

  it('names the exercises rather than only the number', () => {
    const biceps = attribution.find((entry) => entry.muscle === 'biceps')

    expect(biceps?.contributions.length).toBeGreaterThan(0)
    for (const contribution of biceps?.contributions ?? []) {
      expect(contribution.name.length).toBeGreaterThan(0)
    }
  })

  it('shows the strength lift paying the muscles it trains', () => {
    // A squat is not only quads, and the back-off sets count too. Without
    // this the lifter cannot see why their hamstrings need so little
    // dedicated work.
    const quads = attribution.find((entry) => entry.muscle === 'quads')
    const squat = quads?.contributions.find((entry) => entry.exerciseId === 'low-bar-squat')

    expect(squat?.role).toBe('strength')
    expect(squat?.kind).toBe('primary')
    expect(squat?.sets).toBeGreaterThan(1)
  })

  it('orders the largest contributor first', () => {
    for (const entry of attribution) {
      const counted = entry.contributions.map((contribution) => contribution.counted)
      expect(
        [...counted].sort((a, b) => b - a),
        entry.label,
      ).toEqual(counted)
    }
  })

  it('excludes warm-ups, which are not volume', () => {
    const everything = attribution.flatMap((entry) => entry.contributions)

    expect(everything.some((entry) => entry.exerciseId === 'shoulder-dislocation')).toBe(false)
    expect(everything.some((entry) => entry.exerciseId === 'foam-roll')).toBe(false)
  })
})
