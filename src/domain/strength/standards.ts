import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import type { ExerciseId } from '@/domain/ids/ids'
import { asExerciseId } from '@/domain/ids/ids'

/**
 * Where each competition lift stands against published bodyweight
 * standards, as plain numbers.
 *
 * **No ranks.** This was a ladder of named levels — Untrained to Elite —
 * on a character sheet, and the names went with the rest of the game:
 * the app is a workout tracker now. What is left is the part that was
 * always a measurement: the estimated max, what multiple of bodyweight it
 * is, and the next published multiple above it with the load that would
 * reach it.
 *
 * The multiples are male standards in the region of ExRx and Symmetric
 * Strength; they differ in the decimals but agree on the shape. What
 * matters is that they are fixed and external — a scale the app could
 * move would mean nothing.
 */
export const STRENGTH_STANDARDS: Readonly<Record<string, readonly number[]>> = {
  [STRENGTH_LIFT_SLUGS.squat]: [0.75, 1.25, 1.5, 2.25, 2.75],
  [STRENGTH_LIFT_SLUGS.bench]: [0.5, 0.75, 1.25, 1.75, 2.0],
  [STRENGTH_LIFT_SLUGS.deadlift]: [1.0, 1.5, 2.0, 2.5, 3.0],
}

/**
 * The total's standards, summed from the three lifts rather than listed.
 *
 * Written separately they drifted once: a hand-typed total disagreed with
 * all three of the lifts it was the sum of, which is an arithmetic error
 * nobody reading the screen could spot.
 */
export const TOTAL_STANDARDS: readonly number[] = (
  STRENGTH_STANDARDS[STRENGTH_LIFT_SLUGS.squat] ?? []
).map((_unused, index) =>
  Number(
    (
      (STRENGTH_STANDARDS[STRENGTH_LIFT_SLUGS.squat]?.[index] ?? 0) +
      (STRENGTH_STANDARDS[STRENGTH_LIFT_SLUGS.bench]?.[index] ?? 0) +
      (STRENGTH_STANDARDS[STRENGTH_LIFT_SLUGS.deadlift]?.[index] ?? 0)
    ).toFixed(2),
  ),
)

export interface LiftStanding {
  readonly name: string
  /** The estimated max, absent when none is recorded. */
  readonly max?: number
  /** `max / bodyweight`, absent without both. */
  readonly multiple?: number
  /** The next published multiple above this one, and the load it takes. */
  readonly next?: { readonly multiple: number; readonly load: number }
}

export interface StandardsInputs {
  readonly estimatedMaxes: Readonly<Partial<Record<ExerciseId, number>>>
  readonly bodyweight?: number
}

/** Rounded up to five, because a target is a bar somebody has to load. */
function loadFor(multiple: number, bodyweight: number): number {
  return Math.ceil((multiple * bodyweight) / 5) * 5
}

function standing(
  name: string,
  max: number | undefined,
  thresholds: readonly number[],
  bodyweight: number | undefined,
): LiftStanding {
  if (max === undefined) return { name }
  if (bodyweight === undefined || bodyweight <= 0) return { name, max }

  const multiple = max / bodyweight
  const above = thresholds.find((threshold) => threshold > multiple)

  return {
    name,
    max,
    multiple,
    ...(above === undefined ? {} : { next: { multiple: above, load: loadFor(above, bodyweight) } }),
  }
}

const LIFTS: readonly (readonly [string, string])[] = [
  [STRENGTH_LIFT_SLUGS.squat, 'Squat'],
  [STRENGTH_LIFT_SLUGS.bench, 'Bench press'],
  [STRENGTH_LIFT_SLUGS.deadlift, 'Deadlift'],
]

/**
 * The three lifts and their total.
 *
 * The total is absent rather than partial when a lift has no max — a
 * total of two lifts is not a total, and reading it against the
 * three-lift standards would understate it.
 */
export function strengthStandings(inputs: StandardsInputs): {
  readonly lifts: readonly LiftStanding[]
  readonly total: LiftStanding
} {
  const { estimatedMaxes, bodyweight } = inputs

  const lifts = LIFTS.map(([slug, name]) =>
    standing(name, estimatedMaxes[asExerciseId(slug)], STRENGTH_STANDARDS[slug] ?? [], bodyweight),
  )

  const maxes = lifts.map((lift) => lift.max)
  const total = maxes.every((max): max is number => max !== undefined)
    ? maxes.reduce((sum, max) => sum + max, 0)
    : undefined

  return { lifts, total: standing('Total', total, TOTAL_STANDARDS, bodyweight) }
}
