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
 * The lifts run as strength work, which is four — and only three of them
 * are a total.
 *
 * The overhead press was removed as a main lift because 5/3/1 wanted a
 * fourth one and it contributes nothing to a powerlifting total. The
 * second half is still true and is why this list and the total are
 * separate things: `measure.ts` names squat, bench and deadlift
 * explicitly, and `isCompetition` is false on the press, so adding it
 * here gives it a top set and back-offs without putting it in the score.
 *
 * **Do not compute the total from this array.** It was safe to conflate
 * the two while they were the same three lifts, and it is exactly the
 * kind of thing that looks like a tidy-up later.
 */
export const STRENGTH_LIFTS = ['squat', 'bench', 'deadlift', 'press'] as const
export type StrengthLift = (typeof STRENGTH_LIFTS)[number]

export const STRENGTH_LIFT_LABELS: Record<StrengthLift, string> = {
  squat: 'Squat',
  bench: 'Bench press',
  deadlift: 'Deadlift',
  press: 'Overhead press',
}

/** Sessions a week for each competition lift. */
export type LiftSessions = Readonly<Record<StrengthLift, number>>

/**
 * What the shipped split has room for: two lower days shared by the squat
 * and the deadlift, and two upper days holding one press each.
 *
 * The bench drops to one session a week and the overhead press takes the
 * other upper day. That is a real reduction in bench frequency and the
 * trade is the point — one heavy horizontal press and one heavy vertical
 * press, rather than the same movement twice.
 *
 * A third session for any of these would need a day that does not exist,
 * and `assignStrengthLifts` quietly drops it.
 */
/**
 * One competition lift a day, on every day of the week.
 *
 * The squat and the deadlift were twice each, which put both of them on
 * both lower days — a squat opening every lower session and a deadlift
 * following it. Asked to drop the second: _"let's drop the second
 * strength movement on lower days."_ With two lower days and one lift
 * each, that is one session apiece.
 *
 * **The cost lands on the variations rather than on the lift**, which is
 * how the rotation was designed to fail: `strengthSlugFor` takes the
 * lift's session ordinal modulo the rotation, and index 0 is always the
 * competition version. So a lift at one session a week is the
 * competition version every week — a low bar squat and a sumo deadlift,
 * with the high bar and conventional variants no longer scheduled at
 * all. That is deliberate. The number the total is scored on keeps
 * getting trained; what goes is the variety around it.
 */
export const DEFAULT_LIFT_SESSIONS: LiftSessions = {
  squat: 1,
  bench: 1,
  deadlift: 1,
  press: 1,
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
