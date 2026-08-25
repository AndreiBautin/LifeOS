import { describe, expect, it } from 'vitest'

import { deriveProgram } from '@/application/use-cases/programs/current-program'
import { builtInExercises } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { sumVolume, volumeForSlots } from '@/domain/volume/accounting'

import { hypertrophyCredit } from '@/domain/volume/accounting'

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

    expect(primary?.counted).toBeGreaterThan(0)
    expect(secondary.length).toBeGreaterThan(0)

    /*
     * Half of what the same exercise credits its own primary, rather
     * than half of its raw set count.
     *
     * Those were the same number while every set was worth exactly one.
     * They stopped being once credit started accounting for proximity to
     * failure — a bench set at RPE 8 is worth 0.8 to the chest and
     * therefore 0.4 to the triceps, not 0.5. The halving is the rule
     * here; what it halves is somebody else's business.
     */
    for (const contribution of secondary) {
      const ownPrimary = attribution
        .flatMap((entry) => entry.contributions)
        .find((entry) => entry.exerciseId === contribution.exerciseId && entry.kind === 'primary')

      expect(ownPrimary, contribution.name).toBeDefined()
      expect(contribution.counted, contribution.name).toBeCloseTo(
        (ownPrimary?.counted ?? 0) * 0.5,
        2,
      )
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

describe('crediting low-rep work', () => {
  it('counts a heavy triple as less than a set of ten', () => {
    // A top-set single counting as one hard set is what let three
    // competition lifts overshoot a maintained muscle's weekly target on
    // their own — arithmetically true, physiologically misleading.
    expect(hypertrophyCredit(1)).toBeLessThan(hypertrophyCredit(3))
    expect(hypertrophyCredit(3)).toBeLessThan(hypertrophyCredit(5))
  })

  it('gives full credit at five reps and no more above it', () => {
    // Past the threshold the limit is fatigue, not stimulus: a set of
    // twenty is not four sets.
    expect(hypertrophyCredit(5)).toBe(1)
    expect(hypertrophyCredit(10)).toBe(1)
    expect(hypertrophyCredit(20)).toBe(1)
  })

  it('leaves a set with no reps worth nothing', () => {
    expect(hypertrophyCredit(0)).toBe(0)
  })

  it('discounts the competition lifts in the block that ships', () => {
    // Five sets of five squats is five credited sets; the same five sets
    // at a triple would be three. This is the number that decides how
    // much accessory work the legs still need.
    const quads = attribution.find((entry) => entry.muscle === 'quads')
    const squat = quads?.contributions.find((entry) => entry.exerciseId === 'low-bar-squat')

    expect(squat).toBeDefined()
    expect(squat?.counted).toBeLessThanOrEqual(squat?.sets ?? 0)
  })
})
