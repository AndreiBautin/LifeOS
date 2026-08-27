import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'
import type { LiftSessions } from '@/domain/priority/tiers'
import { STRENGTH_LIFTS } from '@/domain/priority/tiers'
import type { MuscleVolumes } from '@/domain/volume/levels'

/**
 * Whether a lifter's priorities still match the ones the app ships.
 *
 * Settings are legitimately the lifter's own — nothing here overwrites
 * them — and that creates a gap the app was otherwise silent about. A
 * choice saved months ago goes on being used after the shipped defaults
 * have moved underneath it, and the screen showing "Side delts, twice a
 * week" is telling the truth about a decision the lifter may not remember
 * making.
 *
 * So divergence is reported rather than resolved. Knowing your settings
 * differ from the defaults is the whole of what is missing; what to do
 * about it stays a decision.
 *
 * This compared tier membership, ignoring order within a tier, because
 * order was presentation. Comparing numbers needs no such care — there is
 * nothing left that is presentation.
 */
export function musclesDivergeFrom(a: MuscleVolumes, b: MuscleVolumes): readonly MuscleGroup[] {
  return MUSCLE_GROUPS.filter(
    (muscle) =>
      a[muscle].sessionsPerWeek !== b[muscle].sessionsPerWeek ||
      a[muscle].level !== b[muscle].level,
  )
}

export function liftsDivergeFrom(a: LiftSessions, b: LiftSessions): boolean {
  return STRENGTH_LIFTS.some((lift) => a[lift] !== b[lift])
}
