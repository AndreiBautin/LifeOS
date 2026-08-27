import { invariant } from '@/domain/errors/domain-error'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { reachableWeeklySets } from '@/domain/volume/frequency'
import type { VolumeLandmarks } from '@/domain/volume/landmarks'

/**
 * Tier-based prioritisation.
 *
 * Replaces ramping volume targets across cycles. The lifter states what
 * matters — tier 1 is highest — and the tier structure decides where each
 * muscle sits inside its own landmark band.
 *
 * A muscle's target depends on **its own rank and its own landmarks**,
 * and on nothing else. Tier 1 sits at the top of the adaptive range,
 * tier 3 at maintenance, and the tiers between are spaced evenly. Adding
 * a muscle to a tier gives that muscle that tier's target and moves no
 * other number.
 *
 * That is a deliberate reversal — see {@link priorityPosition} for what
 * was there before and why it had to go. The finite-recovery argument it
 * encoded is true, but it is a limit on what a week can *hold*, not a
 * reason to quietly renegotiate what the lifter asked for. That limit is
 * reported by comparing the ask against the program the assembler
 * actually builds, where it can be seen and acted on.
 */

/** A tier holds one or more members, all treated as equal priority. */
export interface Tier<T extends string> {
  readonly rank: number
  readonly members: readonly T[]
  readonly label?: string
}

export type MuscleTiers = readonly Tier<MuscleGroup>[]

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

export type StrengthTiers = readonly Tier<StrengthLift>[]

/* -------------------------------------------------------------------- */
/* What a tier is worth                                                  */
/* -------------------------------------------------------------------- */

/**
 * Three tiers, three answers, and no arithmetic in between.
 *
 * ```
 *   tier 1   MRV   ten sets a week, twice, five a session
 *   tier 2   MEV   six sets a week, twice, three a session
 *   tier 3   none  no dedicated work at all
 * ```
 *
 * This replaced a mapping that put each tier at a *position* between 0 and
 * 1, lerped that position through four anchors — MV, MEV, MAV, ceiling —
 * and clamped the result to what the tier's frequency could deliver. Every
 * piece of it was there for a reason and it took four constants and three
 * paragraphs to say what the table above says in three lines. Worse, the
 * numbers it produced could not be predicted from the tier list: moving a
 * muscle changed its target by an amount you had to run the code to learn.
 *
 * What was lost, so nobody rediscovers it as a surprise. The old mapping
 * spread muscles smoothly through the productive band, so a four-tier or
 * two-tier list still made sense and a muscle could sit *between* MEV and
 * MRV. Now a tier list with more than three tiers has nothing to say about
 * the fourth, and there is no way to ask for eight sets. If that becomes a
 * real need, the honest fix is a fourth row in this table rather than a
 * return to interpolation.
 *
 * The pairing with the slot rule is the part worth keeping in mind: five
 * sets a session is `MAX_DIRECT_SETS_PER_SESSION` and three is
 * `minSetsPerSlot`, so with one exercise per muscle per session a tier
 * chooses which end of the 3–5 range that exercise sits at. Nothing else
 * needs deciding.
 */
function targetForRank(rank: number, landmarks: VolumeLandmarks): number {
  const asked = rank === 1 ? landmarks.mrv : rank === 2 ? landmarks.mev : 0

  /*
   * Held to what the tier's sessions can actually deliver.
   *
   * Reads as redundant against the shipped numbers — tier 1 asks for MRV,
   * MRV is ten, and two sessions of five is ten — and it is not, because
   * the check-in loop raises MRV. A lifter who keeps recovering early at
   * their ceiling has that ceiling moved up, and without this the target
   * would follow it past anything two sessions can hold and sit on the
   * Plan screen as a shortfall nobody could close.
   */
  return Math.min(asked, reachableWeeklySets(rank))
}

/** Which tier a member sits in. Unplaced members are treated as bottom. */
export function tierRankOf<T extends string>(tiers: readonly Tier<T>[], member: T): number {
  return tiers.find((tier) => tier.members.includes(member))?.rank ?? tiers.length
}

/**
 * A member's weekly set target: its tier's number, and nothing else.
 *
 * The only entry point callers should use. There are three — the
 * assembler, the explanation and the tier editor — and when the rule lived
 * partly in each of them they disagreed: the editor promised thirteen
 * sets, the assembler delivered ten, and the Plan screen reported the
 * difference as the lifter's week being too small.
 */
export function weeklyTargetForMember<T extends string>(
  tiers: readonly Tier<T>[],
  member: T,
  landmarks: VolumeLandmarks,
): number {
  return targetForRank(tierRankOf(tiers, member), landmarks)
}

/**
 * The target for a specific week of a block.
 *
 * Flat across the working weeks, and MV on the deload **whatever the
 * tier** — a deload is a week off from the tier list, not a scaled-down
 * version of it. There is no ramp: see the note in `CLAUDE.md` on why
 * every working week is identical.
 */
export function weeklyTargetForWeek<T extends string>(
  tiers: readonly Tier<T>[],
  member: T,
  landmarks: VolumeLandmarks,
  isDeload: boolean,
): number {
  if (isDeload) return Math.max(0, Math.round(landmarks.mv))
  return weeklyTargetForMember(tiers, member, landmarks)
}

/* -------------------------------------------------------------------- */
/* Validation and defaults                                               */
/* -------------------------------------------------------------------- */

export function validateTiers<T extends string>(tiers: readonly Tier<T>[]): void {
  invariant(tiers.length > 0, 'TIERS_EMPTY', 'A priority list needs at least one tier.')

  const ranks = tiers.map((tier) => tier.rank)
  invariant(
    new Set(ranks).size === ranks.length,
    'TIERS_DUPLICATE_RANK',
    'Two tiers share the same rank. Ranks order the tiers, so they must be distinct.',
  )

  const seen = new Set<T>()
  for (const tier of tiers) {
    for (const member of tier.members) {
      invariant(
        !seen.has(member),
        'TIERS_DUPLICATE_MEMBER',
        `"${member}" appears in more than one tier. A member has exactly one priority.`,
      )
      seen.add(member)
    }
  }
}

/**
 * The seeded priorities.
 *
 * Bench alone at the top, squat and deadlift below it; arms and side
 * delts at the top for hypertrophy, then back and chest, then everything
 * else. A two-of-fourteen top tier is a concentrated structure, so the
 * spread factor comes out high and those muscles genuinely get pushed.
 */
/**
 * Three tiers for the lifts, not two.
 *
 * Two tiers only offered "grow this" and "hold that", and holding is not
 * what anybody wants from a squat while they push a bench. Three lets the
 * middle mean what it should: still progressing, just paying for the
 * priority out of its rate rather than out of its existence.
 *
 * The bottom rank still exists and is still worth having — a lift coming
 * back from a tweak, or one deliberately parked for a block — but nothing
 * is put there by default.
 */
export const DEFAULT_STRENGTH_TIERS: StrengthTiers = [
  /*
   * Bench three times, squat and deadlift twice each.
   *
   * Eight strength sessions across five days, so both lower lifts share
   * both lower days — there are only two of them and a tier-2 lift wants
   * two sessions. Those days are demanding on purpose.
   *
   * An earlier default put both lower lifts at tier 3, one session each,
   * reasoning that maintained legs should not be squatted twice a week.
   * That reads well and answers the wrong question. The muscle tiers
   * govern *hypertrophy* volume; frequency on a competition lift is about
   * the strength and the skill. Squatting twice is a strength decision,
   * and how many quad sets it happens to pay is a consequence the
   * capacity report on the Plan screen will show either way.
   */
  /*
   * Nothing specialised, and there is no room for it.
   *
   * Tier 1 buys three sessions a week and the four-day split has two
   * upper days and two lower ones, so a specialised lift would ask for a
   * third session that does not exist. The tier is empty rather than
   * unused: it is what a fifth day would buy, and leaving it visible is
   * how that trade stays legible.
   */
  { rank: 1, members: [], label: 'Specialising' },
  { rank: 2, members: ['bench', 'squat', 'deadlift'], label: 'Building' },
  { rank: 3, members: [], label: 'Maintaining' },
]

export const DEFAULT_MUSCLE_TIERS: MuscleTiers = [
  /*
   * Three at the top, and the arms no longer move together.
   *
   * The biceps stay specialised and the triceps drop to building, which
   * looks inconsistent until you count what pays them: three bench
   * sessions and a day of dips cover the triceps before anything is
   * scheduled for them, while the biceps get only what the pulls pay.
   * Tiering the arms as a unit asked for a symmetry the week does not
   * have.
   *
   * The lats were briefly here and are not, which is the more useful
   * note. Promoting them raised the ask from fourteen sets to nineteen
   * and the week delivered sixteen and a half — the chin-ups and pull-ups
   * were already at the per-session cap on every day that carries them,
   * so the extra target had nowhere to go. A tier is a request, and
   * requesting volume the split cannot physically fit produces a
   * permanent entry on the capacity report rather than more lat work.
   *
   * The fix, if the lats ever do want specialising, is a third pull
   * variant in the catalogue — not a higher number here.
   */
  /*
   * Empty, and for the same reason the strength tier above is: three
   * sessions of an upper muscle need three upper days and the split has
   * two. Anything put here would ask for a session that does not exist
   * and land on the capacity report every week.
   */
  { rank: 1, members: [], label: 'Specialising' },
  {
    rank: 2,
    members: [
      'chest',
      'side-delts',
      'biceps',
      'rear-delts',
      'triceps',
      'lats',
      'upper-back',
      'calves',
    ],
    label: 'Building',
  },
  /*
   * Maintained, which here means no dedicated slot at all.
   *
   * The legs were already here and the reasoning now extends to the trunk
   * and the grip: the squat and the deadlift are the quads, hamstrings and
   * glutes, and they are also most of what the core and the forearms get.
   * Traps join them because nothing in a four-day week is short of pulling,
   * and the front delts because two bench sessions are already more
   * anterior pressing than their four-set MAV wants — their MV and MEV are
   * both zero, which is the landmark table saying the same thing.
   *
   * Worth being exact, because "maintaining" is easy to read as "a little
   * bit of work". It is a *volume* tier: it decides how much dedicated
   * work the week schedules, and at the bottom the answer is what the
   * competition lifts already pay and nothing more.
   */
  {
    rank: 3,
    members: ['quads', 'hamstrings', 'glutes', 'core', 'forearms', 'traps', 'front-delts'],
    label: 'Maintaining',
  },
]

/* -------------------------------------------------------------------- */
/* Priority as frequency                                                 */
/* -------------------------------------------------------------------- */

/**
 * Weekly sessions a competition lift gets, by tier.
 *
 * Priority buys **frequency** for the strength lifts, not a bigger
 * fatigue allowance. The two are alternative ways to spend a
 * prioritisation and only one of them keeps the RTS stopping rule
 * intelligible.
 *
 * Spending it on fatigue was the old answer: a tier-1 lift was allowed
 * to accumulate 7% while a tier-3 lift stopped at 2%. It works, and it
 * quietly detaches the stopping rule from the thing a lifter can
 * remember — with the load drop fixed at 5% and the allowance varying by
 * tier, "stop when the lighter bar feels like your top set" is true for
 * exactly one tier and off by half an RPE for the others.
 *
 * Spending it on frequency keeps every session identical in shape and
 * puts the difference where it is visible on the calendar: the bench is
 * prioritised, so it is benched three times a week. That is also how
 * anyone would describe the program out loud.
 */
export const STRENGTH_SESSIONS_BY_TIER: Readonly<Record<number, number>> = {
  1: 3,
  2: 2,
  3: 1,
}

/** How many sessions a week this lift should be trained. */
export function strengthSessionsFor(tiers: StrengthTiers, lift: StrengthLift): number {
  const rank = tiers.find((tier) => tier.members.includes(lift))?.rank ?? 3
  return STRENGTH_SESSIONS_BY_TIER[rank] ?? 1
}

/**
 * Puts any muscle the stored tiers have never heard of into the bottom
 * tier.
 *
 * A tier list is saved the first time a lifter touches the Priorities
 * screen and is never overwritten — which is right, they are their
 * choices. It also means a muscle group added later exists in the app and
 * not in their settings, belonging to no tier at all.
 *
 * That is worse than it sounds. `priorityPosition` answers
 * `BOTTOM_TIER_POSITION` for an unknown member, so the volume is roughly
 * correct by luck, while every screen that reads a *tier* has nothing to
 * show — the muscle appears in the editor with no rank selected and in
 * the plan with no tier label. The number and the explanation disagree,
 * which is the one failure this whole area is built to avoid.
 *
 * The bottom tier is the right home for a muscle nobody has expressed an
 * opinion about: it asks for maintenance rather than silently claiming a
 * share of the week. Promoting it is one tap away and is a decision the
 * lifter should make.
 */
export function completeTiers<T extends string>(
  tiers: readonly Tier<T>[],
  everyMember: readonly T[],
): readonly Tier<T>[] {
  const placed = new Set(tiers.flatMap((tier) => tier.members))
  const missing = everyMember.filter((member) => !placed.has(member))

  if (missing.length === 0) return tiers

  const bottom = tiers.reduce<Tier<T> | undefined>(
    (lowest, tier) => (lowest === undefined || tier.rank > lowest.rank ? tier : lowest),
    undefined,
  )

  if (bottom === undefined) return tiers

  return tiers.map((tier) =>
    tier === bottom ? { ...tier, members: [...tier.members, ...missing] } : tier,
  )
}
