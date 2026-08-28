import { describe, expect, it } from 'vitest'

import { deriveProgram } from '@/application/use-cases/programs/current-program'
import { builtInExercises } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { countsAsHypertrophy, sumVolume, volumeForSlots } from '@/domain/volume/accounting'

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
  /*
   * The breakdown explains a number, so it has to be the same number.
   * Compared against the hypertrophy slots only, because that is what the
   * breakdown now covers — see `countsAsHypertrophy`.
   */
  it('totals exactly what the volume map totals, muscle for muscle', () => {
    const counted = sumVolume(
      week.days.map((day) =>
        volumeForSlots(
          day.slots.flatMap((slot) =>
            slot.exercise.kind === 'specific' && countsAsHypertrophy(slot.role)
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

  it('counts a direct set whole and an indirect one at nothing', () => {
    /*
     * The rule that replaced two layers of fractional credit. A set is
     * one set for the muscle it is programmed for, and zero for every
     * other muscle it happens to work.
     *
     * The secondary rows are still *listed* — a breakdown screen saying a
     * bench press works the triceps is telling the truth — they simply
     * carry no number that a target is measured by.
     */
    const mixed = attribution.find(
      (entry) =>
        entry.contributions.some((one) => one.kind === 'primary' && one.counted > 0) &&
        entry.contributions.some((one) => one.kind === 'secondary'),
    )

    expect(mixed, 'no muscle receives both direct and indirect work').toBeDefined()

    for (const contribution of mixed?.contributions ?? []) {
      if (contribution.kind === 'secondary') {
        expect(contribution.counted, contribution.exerciseId).toBe(0)
      } else {
        expect(contribution.counted, contribution.exerciseId).toBe(contribution.sets)
      }
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

  /*
   * The competition lifts used to appear here, and the note said it was so
   * a lifter could see why their hamstrings need so little dedicated work.
   * That reasoning belonged to a model where the strength work paid a
   * hypertrophy target; it no longer does, so a breakdown of hypertrophy
   * volume that listed the squat would be explaining a number the squat
   * does not contribute to.
   *
   * Conditioning goes for the same reason and a louder one. Thirty sets of
   * ten kettlebell swings arrived as **sixty glute sets a week** against a
   * target of zero, purely because the swings were prescribed as sets
   * rather than as a block of time — nothing about the work had changed.
   */
  it('leaves the competition lifts and the conditioning out of it', () => {
    for (const entry of attribution) {
      for (const contribution of entry.contributions) {
        expect(
          countsAsHypertrophy(contribution.role),
          `${entry.label}: ${contribution.name} (${contribution.role})`,
        ).toBe(true)
      }
    }
  })

  it('reports nothing for a muscle only the lifts and conditioning touch', () => {
    // Quads are squatted heavily every lower day and have no hypertrophy
    // slot, so their hypertrophy volume is zero and the breakdown says so.
    const quads = attribution.find((entry) => entry.muscle === 'quads')

    expect(quads?.total).toBe(0)
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

describe('crediting the competition lifts', () => {
  /*
   * A set is a set. This was written about the competition lifts, which
   * were discounted for being low-rep — five sets at a triple counted as
   * three — and they are no longer in the breakdown at all. The rule it
   * was really guarding is that nothing is discounted, so it is asserted
   * where the breakdown still reaches.
   */
  it('counts a working set as one whole set', () => {
    const rows = attribution.flatMap((entry) =>
      entry.contributions.filter((contribution) => contribution.kind === 'primary'),
    )

    expect(rows.length).toBeGreaterThan(0)

    for (const row of rows) {
      expect(row.counted, row.name).toBe(row.sets)
    }
  })
})
