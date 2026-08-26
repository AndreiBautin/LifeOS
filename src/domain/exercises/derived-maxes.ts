import { VARIATION_OF } from '@/domain/exercises/catalogue'
import type { ExerciseId } from '@/domain/ids/ids'

/**
 * Fills in a variation's estimated max from the lift it descends from.
 *
 * A close-grip bench is its own lift with its own maximum, so it gets its
 * own entry in `estimatedMaxes` and its own history. But nobody has one
 * on the day the exercise appears, and an RPE set with no suggested load
 * is a worse introduction to a new movement than a slightly wrong number
 * would be.
 *
 * **A measured estimate always wins.** This only supplies what is
 * missing, and the moment the lifter sets or logs one the ratio stops
 * being consulted — a number off a bar beats a number off a ratio, and a
 * derived value that kept overriding a real one would be the training-max
 * mistake in a new costume.
 *
 * Pure, and applied where the athlete is assembled rather than inside
 * `resolve`. Resolution stays a function of the numbers it is handed; if
 * it started deriving its own inputs there would be two places that
 * decide what a load is based on, and they would disagree.
 */
export function withDerivedMaxes(
  estimatedMaxes: Readonly<Partial<Record<ExerciseId, number>>>,
): Readonly<Partial<Record<ExerciseId, number>>> {
  let filled: Partial<Record<ExerciseId, number>> | undefined

  for (const [slug, { of, factor }] of Object.entries(VARIATION_OF)) {
    const id = slug as ExerciseId
    if (estimatedMaxes[id] !== undefined) continue

    const parent = estimatedMaxes[of as ExerciseId]
    if (parent === undefined) continue

    filled ??= { ...estimatedMaxes }
    filled[id] = Math.round(parent * factor)
  }

  // Returned by identity when nothing was added, so a caller can rely on
  // referential equality and React does not re-render for a copy.
  return filled ?? estimatedMaxes
}
