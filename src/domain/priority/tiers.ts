import { invariant } from '@/domain/errors/domain-error'
import { MAX_SESSIONS_PER_WEEK } from '@/domain/volume/levels'

/**
 * How often each thing is trained. That is the whole of prioritisation
 * now.
 *
 * **There are no tiers.** A muscle carries a number of sessions a week
 * and a volume level; a lift carries a number of sessions a week. Nothing
 * is ranked against anything else, and no number here is derived from
 * another one.
 *
 * The file keeps its name because the *screen* is still the priorities
 * screen and the concept is still priority — what you train more often
 * matters more to you. What is gone is the indirection: a tier used to be
 * a rank, the rank chose a position in a band, the position chose a
 * target, and the target was clamped by a frequency the same rank had
 * also chosen. Four steps to answer "how many sets do my side delts get",
 * and no way to answer it without running the code.
 *
 * The tiers themselves were the last casualty of a long simplification.
 * They are worth a paragraph because they will be proposed again, and the
 * reason they went is not that ranking is a bad idea — it is that a rank
 * is an *input to* a decision about frequency and volume, and once you
 * are willing to state those two directly the rank is a lossy encoding of
 * them wearing the clothes of a simpler idea.
 */

/**
 * The three lifts that make up the powerlifting total.
 *
 * Three, not four. The overhead press was a main lift only because 5/3/1
 * needed a fourth one to fill a four-day week; it contributes nothing to
 * a total and is trained here as hypertrophy work in the 3–6 range like
 * any other pressing movement.
 */
export const STRENGTH_LIFTS = ['squat', 'bench', 'deadlift'] as const
export type StrengthLift = (typeof STRENGTH_LIFTS)[number]

export const STRENGTH_LIFT_LABELS: Record<StrengthLift, string> = {
  squat: 'Squat',
  bench: 'Bench press',
  deadlift: 'Deadlift',
}

/** Sessions a week for each competition lift. */
export type LiftSessions = Readonly<Record<StrengthLift, number>>

/**
 * Two each, which is what the shipped split has room for.
 *
 * Two upper days and two lower ones: the bench takes both upper days, and
 * the squat and the deadlift share both lower days. A third session for
 * any of them would need a day that does not exist, and
 * `assignStrengthLifts` would quietly drop it.
 */
export const DEFAULT_LIFT_SESSIONS: LiftSessions = {
  squat: 2,
  bench: 2,
  deadlift: 2,
}

/** How many sessions a week this lift should be trained. */
export function strengthSessionsFor(sessions: LiftSessions, lift: StrengthLift): number {
  return sessions[lift]
}

export function validateLiftSessions(sessions: LiftSessions): void {
  for (const lift of STRENGTH_LIFTS) {
    const value = sessions[lift]
    invariant(
      Number.isInteger(value) && value >= 0 && value <= MAX_SESSIONS_PER_WEEK,
      'LIFT_SESSIONS_OUT_OF_RANGE',
      `${lift} must be trained between 0 and ${String(MAX_SESSIONS_PER_WEEK)} times a week, received ${String(value)}.`,
    )
  }
}

/**
 * Fills in any lift a saved setting does not mention.
 *
 * Settings are written once and never overwritten, which is right — they
 * are the lifter's choices — and it means anything added later exists in
 * the app and not in their stored copy. The old `completeTiers` existed
 * for exactly this and the failure it caught was worth having: a muscle
 * belonging to no tier read as maintenance volume by luck while every
 * screen showing a *tier* had nothing to display, so the number and the
 * explanation disagreed.
 */
export function completeLiftSessions(saved: Partial<LiftSessions>): LiftSessions {
  return Object.fromEntries(
    STRENGTH_LIFTS.map((lift) => [lift, saved[lift] ?? DEFAULT_LIFT_SESSIONS[lift]]),
  ) as LiftSessions
}
