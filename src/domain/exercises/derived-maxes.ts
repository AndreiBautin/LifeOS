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
/**
 * Moves a bench estimate onto the paused bench when the competition lift
 * changed underneath it.
 *
 * `bench-press` used to be the competition lift and is now the
 * touch-and-go variation. A lifter who had an estimate under that slug
 * has one for a lift that is no longer scored, and nothing at all for the
 * one that is — so the character sheet would report no bench and the
 * total would lose a third of itself, from settings nobody touched.
 *
 * **Discounted by the same ratio the derivation uses.** The stored number
 * was measured on a bar with no pause, whatever the exercise was called
 * at the time, so copying it across verbatim would credit a paused max
 * nobody has pressed. Five per cent is the same figure
 * {@link VARIATION_OF} uses in the other direction, so the two agree.
 *
 * Runs once and is idempotent: it does nothing once a paused estimate
 * exists, including one the lifter has since corrected. Corrections are
 * the point — this is a starting position, not a claim.
 */
export function migrateBenchEstimate(
  estimatedMaxes: Readonly<Partial<Record<ExerciseId, number>>>,
): Readonly<Partial<Record<ExerciseId, number>>> {
  const paused = 'paused-bench-press' as ExerciseId
  const touchAndGo = 'bench-press' as ExerciseId

  if (estimatedMaxes[paused] !== undefined) return estimatedMaxes

  const previous = estimatedMaxes[touchAndGo]
  if (previous === undefined) return estimatedMaxes

  return { ...estimatedMaxes, [paused]: Math.round(previous * 0.95) }
}

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
