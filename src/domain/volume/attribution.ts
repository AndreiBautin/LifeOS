import type { Exercise } from '@/domain/exercises/exercise'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'
import type { ExerciseId } from '@/domain/ids/ids'
import type { ProgramWeek, SlotRole } from '@/domain/programs/program'
import { nominalReps } from '@/domain/programs/prescription'
import { countsAsHypertrophy, countsAsWorking, slotVolume } from '@/domain/volume/accounting'

/**
 * Which exercises produced a muscle's weekly volume, and how much each
 * one actually contributed.
 *
 * The volume map answers "how many sets did the chest get". It cannot
 * answer the question a lifter actually asks when the number looks wrong,
 * which is *where did that come from* — and the arithmetic is not
 * guessable from the session list, because a set counts differently
 * depending on whether the exercise trains that muscle directly.
 *
 * Six sets of dips and six sets of bench are twelve sets of pressing and
 * nine sets of chest, and nothing on the Train screen says so. This is
 * the breakdown that makes the total checkable.
 */

export type ContributionKind = 'primary' | 'secondary'

export interface Contribution {
  readonly exerciseId: ExerciseId
  readonly name: string
  readonly role: SlotRole
  /** Working sets performed of this exercise across the week. */
  readonly sets: number
  /** Reps per set, which is what decides how much each one is worth. */
  readonly reps: number
  /** Sets counted toward this muscle — fractional for a secondary. */
  readonly counted: number
  readonly kind: ContributionKind
}

export interface MuscleAttribution {
  readonly muscle: MuscleGroup
  readonly label: string
  readonly total: number
  /** Largest contributor first. */
  readonly contributions: readonly Contribution[]
}

/**
 * Attributes a week's volume, muscle by muscle.
 *
 * Counted exactly as {@link slotVolume} counts it, and deliberately not
 * re-derived: a second implementation of the same arithmetic would drift,
 * and a breakdown that disagrees with the total it explains is worse than
 * no breakdown.
 */
export function attributeWeek(
  week: ProgramWeek,
  lookup: (id: ExerciseId) => Exercise | undefined,
): readonly MuscleAttribution[] {
  const byMuscle = new Map<MuscleGroup, Map<string, Contribution>>()

  const add = (
    muscle: MuscleGroup,
    exercise: Exercise,
    role: SlotRole,
    sets: number,
    reps: number,
    counted: number,
    kind: ContributionKind,
  ): void => {
    const forMuscle = byMuscle.get(muscle) ?? new Map<string, Contribution>()
    const key = `${exercise.id as string}|${role}`
    const existing = forMuscle.get(key)

    forMuscle.set(key, {
      exerciseId: exercise.id,
      name: exercise.name,
      role,
      sets: (existing?.sets ?? 0) + sets,
      reps,
      counted: Number(((existing?.counted ?? 0) + counted).toFixed(2)),
      kind,
    })

    byMuscle.set(muscle, forMuscle)
  }

  for (const day of week.days) {
    for (const slot of day.slots) {
      if (slot.exercise.kind !== 'specific') continue

      // Strength and conditioning are not hypertrophy volume, so they do
      // not appear in a breakdown of it. See `countsAsHypertrophy`.
      if (!countsAsHypertrophy(slot.role)) continue

      const exercise = lookup(slot.exercise.exerciseId)
      if (exercise === undefined) continue

      const working = slot.sets.filter(countsAsWorking)
      if (working.length === 0) continue

      /*
       * Credited by asking `slotVolume`, not by repeating it.
       *
       * This used to run its own copy of the arithmetic — same shape,
       * same constants — and the copies drifted the moment credit
       * started accounting for proximity to failure as well as reps. The
       * program was built against one number and the breakdown explaining
       * it printed another, which is the worst possible place for two
       * implementations to disagree.
       */
      const credited = slotVolume(exercise, working)[exercise.primaryMuscle]
      const reps = nominalReps(working[0]?.reps ?? { kind: 'fixed', reps: 0 })

      add(exercise.primaryMuscle, exercise, slot.role, working.length, reps, credited, 'primary')

      for (const secondary of exercise.secondaryMuscles) {
        if (secondary === exercise.primaryMuscle) continue
        /*
         * Listed at zero. The row still says a bench press works the
         * triceps, which is true and useful on a breakdown screen; what it
         * no longer does is put a number against it that a target is
         * measured by.
         */
        add(secondary, exercise, slot.role, working.length, reps, 0, 'secondary')
      }
    }
  }

  return MUSCLE_GROUPS.map((muscle) => {
    const contributions = [...(byMuscle.get(muscle)?.values() ?? [])].sort(
      (a, b) => b.counted - a.counted,
    )

    return {
      muscle,
      label: MUSCLE_GROUP_LABELS[muscle],
      total: Number(contributions.reduce((sum, entry) => sum + entry.counted, 0).toFixed(1)),
      contributions,
    }
  })
}
