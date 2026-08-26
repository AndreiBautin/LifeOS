import type { MuscleGroup } from '@/domain/exercises/taxonomy'

/**
 * What the built week actually delivers, against what the tiers asked
 * for.
 *
 * "You cannot prioritise everything" is true and is usually implemented
 * as a multiplier — scale every target down by how crowded the top tier
 * is. That was tried here and removed: it made every muscle's number
 * depend on every other muscle's placement, so moving the biceps out of
 * tier 1 silently raised the side delts, and no lifter could hold a
 * mental model of their own settings.
 *
 * This is the honest version. The tiers state the ask, unmodified, and
 * the program is built from it. Whatever the week could not fit is
 * *reported*.
 * Nothing is scaled, nothing is renegotiated, and the number on the
 * Priorities screen still means exactly what it says.
 *
 * Measured off the assembler's output rather than modelled, so it cannot
 * drift from what the program does — a predicted shortfall and a real one
 * are different things, and only one of them is worth showing.
 */

export interface Shortfall {
  readonly muscle: MuscleGroup
  readonly label: string
  readonly asked: number
  readonly delivered: number
  /** Always positive. Asked minus delivered. */
  readonly short: number
}

/**
 * Ignored below this, in sets.
 *
 * Credit is fractional — a secondary muscle earns half a set, an RPE 8
 * set earns four fifths — so a muscle can land a tenth of a set below its
 * target through arithmetic alone. Reporting that as a shortfall would
 * bury the muscles genuinely missing five sets in a list of rounding.
 */
export const SHORTFALL_THRESHOLD = 0.5

export interface Delivered {
  readonly muscle: MuscleGroup
  readonly label: string
  readonly total: number
}

/**
 * Muscles the week leaves short, worst first.
 *
 * Per muscle, never aggregated. A total would be meaningless *and*
 * reassuring in the wrong direction: every set pays two or three muscles,
 * so the delivered total across all of them comfortably exceeds the asked
 * total even in a week that starves the side delts. Summing it says the
 * program is over-delivering while a prioritised muscle goes hungry.
 */
export function shortfalls(
  delivered: readonly Delivered[],
  asked: (muscle: MuscleGroup) => number,
): readonly Shortfall[] {
  const found: Shortfall[] = []

  for (const entry of delivered) {
    const target = asked(entry.muscle)

    // A muscle nobody asked for cannot be short of anything. Maintenance
    // muscles sit here, paid entirely by the competition lifts.
    if (target <= 0) continue

    const short = target - entry.total
    if (short <= SHORTFALL_THRESHOLD) continue

    found.push({
      muscle: entry.muscle,
      label: entry.label,
      asked: target,
      delivered: entry.total,
      short: Number(short.toFixed(1)),
    })
  }

  return found.sort((a, b) => b.short - a.short)
}
