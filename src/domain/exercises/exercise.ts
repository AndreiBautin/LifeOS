import type { ExerciseId } from '@/domain/ids/ids'

import type { Equipment, MovementPattern, MuscleGroup } from './taxonomy'

export interface Exercise {
  readonly id: ExerciseId
  readonly name: string
  /** The muscle this exercise is programmed *for*; drives volume accounting. */
  readonly primaryMuscle: MuscleGroup
  /**
   * Muscles that receive meaningful stimulus but are not the reason the
   * exercise is in the program. Counted at a fraction toward weekly
   * volume — see domain/volume.
   */
  readonly secondaryMuscles: readonly MuscleGroup[]
  readonly equipment: Equipment
  readonly pattern: MovementPattern
  readonly isCompound: boolean
  readonly isUnilateral: boolean
  /**
   * A contested lift — squat, bench, deadlift — or the lift a program
   * treats as its main. Carried from LiftTracker, where `IsCompetition`
   * selected the primary movement during a peaking block. Here it also
   * marks the lifts eligible to carry a training max.
   */
  readonly isCompetition: boolean
  /** Where the load comes from when a set prescribes a percentage. */
  readonly loadBasis: LoadBasis
  readonly defaultRepRange?: { readonly low: number; readonly high: number }
  readonly defaultRestSeconds?: number
  readonly notes?: string
  /** Built-in exercises ship with the app and cannot be deleted, only hidden. */
  readonly isBuiltIn: boolean
  readonly isArchived: boolean
}

/**
 * What a percentage prescription is a percentage *of*.
 *
 * A barbell lift with a training max resolves `85%` against that. A
 * cable row has no training max and never will, so `85%` there is
 * meaningless — those exercises are prescribed by RPE or by absolute
 * load instead, and this field is what lets the resolver say so rather
 * than silently producing zero.
 */
export type LoadBasis =
  /** Has (or can have) a training max: percentage prescriptions resolve. */
  | 'training-max'
  /** No training max; a percentage falls back to estimated 1RM if known. */
  | 'estimated-1rm'
  /** Load is the lifter's bodyweight, optionally plus added weight. */
  | 'bodyweight'
  /** Load is whatever is on the machine; only absolute or RPE applies. */
  | 'absolute-only'

/**
 * Describes an exercise by shape rather than by identity, so a program
 * can say "a compound barbell press for chest" and stay valid in a gym
 * that has different equipment.
 *
 * This is LiftTracker's selection query lifted out of the generator and
 * turned into data. There it was a hardcoded argument list inside a
 * `switch` on the day of the week; here it is a value a user can edit.
 */
export interface ExerciseQuery {
  readonly primaryMuscle?: MuscleGroup
  readonly equipment?: Equipment
  readonly pattern?: MovementPattern
  readonly isCompound?: boolean
  readonly isCompetition?: boolean
}

export function matchesQuery(exercise: Exercise, query: ExerciseQuery): boolean {
  if (exercise.isArchived) return false
  if (query.primaryMuscle !== undefined && exercise.primaryMuscle !== query.primaryMuscle)
    return false
  if (query.equipment !== undefined && exercise.equipment !== query.equipment) return false
  if (query.pattern !== undefined && exercise.pattern !== query.pattern) return false
  if (query.isCompound !== undefined && exercise.isCompound !== query.isCompound) return false
  if (query.isCompetition !== undefined && exercise.isCompetition !== query.isCompetition)
    return false
  return true
}

/**
 * Ranks candidate substitutes for an exercise, best first.
 *
 * "Swap exercise" existed in LiftTracker but listed every exercise in the
 * database unordered. Scoring by how much of the original's shape is
 * preserved puts the sensible replacement first: same muscle and pattern
 * beats same muscle, which beats same equipment.
 */
export function rankSubstitutes(
  original: Exercise,
  candidates: readonly Exercise[],
): readonly Exercise[] {
  const score = (candidate: Exercise): number => {
    let points = 0
    if (candidate.primaryMuscle === original.primaryMuscle) points += 8
    if (candidate.pattern === original.pattern) points += 5
    if (candidate.isCompound === original.isCompound) points += 3
    if (candidate.equipment === original.equipment) points += 2
    if (candidate.isUnilateral === original.isUnilateral) points += 1
    return points
  }

  return candidates
    .filter((candidate) => candidate.id !== original.id && !candidate.isArchived)
    .map((candidate) => ({ candidate, points: score(candidate) }))
    .sort((a, b) =>
      b.points === a.points
        ? a.candidate.name.localeCompare(b.candidate.name)
        : b.points - a.points,
    )
    .map(({ candidate }) => candidate)
}
