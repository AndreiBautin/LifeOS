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
/* Where a tier sits, and how hard we are allowed to push                */
/* -------------------------------------------------------------------- */

/**
 * Where the top and bottom of the ordering land inside a muscle's band.
 *
 * Chosen against the landmarks rather than as round numbers.
 * {@link weeklyTargetFor} puts MEV at 0.25 and MAV at 0.75, so the top
 * tier sits just past MAV — the top of the adaptive range, with the last
 * week before a deload overreaching past it — and the bottom sits just
 * under MEV, which is what maintenance means.
 */
export const TOP_TIER_POSITION = 0.8
export const BOTTOM_TIER_POSITION = 0.15

/**
 * A muscle's position in its own band, 0 (MV) to 1 (just under MRV).
 *
 * **Depends on the muscle's own rank and nothing else.** There used to be
 * a `spreadFactor` here that scaled the whole mapping by how crowded the
 * top tier was, on the reasoning that prioritising eight things is not
 * prioritising. The reasoning is sound and the implementation was not:
 * it made every target depend on every other muscle's placement, so
 * moving the biceps out of tier 1 silently raised the side delts from 22
 * sets to 24, and a lifter could not say "these five matter to me"
 * without the app quietly renegotiating. Priority became a zero-sum game
 * played against yourself, with the rules hidden inside a curve.
 *
 * The constraint it was reaching for is real, but it is a **capacity**
 * constraint, not a scaling one, and it belongs where it can be seen: the
 * plan reports what the tiers ask for against what the week actually
 * delivers. Asking for more than five sessions can hold is a thing to be
 * told, not a thing to be silently corrected.
 *
 * Returned as a position rather than a set count so the caller can decide
 * what to do with it — the same position means different absolute volumes
 * for calves and for quads, which is the entire point of per-muscle
 * landmarks.
 */
export function priorityPosition<T extends string>(tiers: readonly Tier<T>[], member: T): number {
  /*
   * Every declared tier counts, empty ones included.
   *
   * This used to filter to the tiers with members in them, so the
   * ordering was the one you had *expressed* rather than the one you had
   * *declared*. Defensible in isolation and wrong beside
   * `TIER_FREQUENCY`, which has always read the declared rank: with the
   * top tier emptied, one function called tier 2 the top of the ordering
   * and handed it a near-MAV target while the other called it rank 2 and
   * bought two sessions. Thirteen sets asked, ten deliverable, and no
   * amount of training fixes a disagreement between two rules.
   *
   * The visible consequence is that emptying a tier now means something.
   * Moving every muscle from tier 1 to tier 2 used to change nothing at
   * all — the relative ordering was identical, so every target was — and
   * "these are all secondary now" is a sentence a lifter is entitled to
   * be able to say.
   *
   * It also fixes the mirror case, which was live and silent: declaring
   * three tiers and leaving the *bottom* one empty put the building
   * muscles at maintenance volume.
   */
  const ordered = [...tiers].sort((a, b) => a.rank - b.rank)

  const index = ordered.findIndex((tier) => tier.members.includes(member))
  // Anything not placed in a tier is treated as lowest priority rather
  // than as an error: a new muscle group should not break a program.
  if (index === -1) return BOTTOM_TIER_POSITION

  // One tier is a statement that nothing is prioritised over anything
  // else, so everything lands in the middle of the range.
  if (ordered.length === 1) return (TOP_TIER_POSITION + BOTTOM_TIER_POSITION) / 2

  const step = index / (ordered.length - 1)
  return clamp01(TOP_TIER_POSITION - step * (TOP_TIER_POSITION - BOTTOM_TIER_POSITION))
}

/**
 * Turns a position into a weekly set target.
 *
 * The top of the range is deliberately **not** MRV. MRV is the volume
 * beyond which you stop recovering; a block that targets it has no
 * headroom for a bad night's sleep, and arriving there in week two means
 * the rest of the block is spent digging out. `overreach` lifts the
 * ceiling to MRV for the single week before a deload, which is the one
 * time accumulating more fatigue than you can clear is the plan.
 */
export interface VolumeTargetOptions {
  readonly overreach?: boolean
}

export function weeklyTargetFor(
  landmarks: VolumeLandmarks,
  position: number,
  options: VolumeTargetOptions = {},
): number {
  const p = clamp01(position)
  const ceiling = options.overreach === true ? landmarks.mrv : justUnder(landmarks)

  /*
   * Four anchors rather than two: MV at the bottom, MEV a quarter of the
   * way up, MAV three quarters, and the ceiling at the top.
   *
   * The obvious two-anchor version — MV → MEV → ceiling with MEV at the
   * midpoint — puts the *middle* tier of a three-tier structure at
   * exactly MEV, which is the least volume that grows anything. A muscle
   * a lifter explicitly named as one they want to build would then get
   * maintenance volume and no ramp. Putting MEV at a quarter leaves the
   * whole productive band available to the middle of the ordering, which
   * is where most muscles sit.
   */
  const value =
    p <= 0.25
      ? lerp(landmarks.mv, landmarks.mev, p / 0.25)
      : p <= 0.75
        ? lerp(landmarks.mev, landmarks.mav, (p - 0.25) / 0.5)
        : lerp(landmarks.mav, ceiling, (p - 0.75) / 0.25)

  return Math.max(0, Math.round(value))
}

/**
 * One set below MRV, or the top of the adaptive band if the two are
 * adjacent. The gap is what leaves room to have a bad week without the
 * block ending early.
 */
function justUnder(landmarks: VolumeLandmarks): number {
  return Math.max(landmarks.mav, landmarks.mrv - 1)
}

/* -------------------------------------------------------------------- */
/* The target, week by week                                              */
/* -------------------------------------------------------------------- */

/**
 * The target for a specific week of a block.
 *
 * Flat across the working weeks, and maintenance on the deload. There is
 * no ramp and no overreach week.
 *
 * There was: week one opened near MEV, the target climbed across the
 * block, and the last working week touched MRV because a deload followed
 * it. That is defensible periodisation and it cost more than it paid
 * here. Every measurement of the program had to name a week to mean
 * anything, every screen showing volume had to pick one, and the Program
 * page carried a tab per week for six weeks that differed only by a
 * gradient nobody had asked to see. A block whose weeks are the same is a
 * block you can describe in one screen.
 *
 * What the ramp was for has not gone away — it is autoregulated instead.
 * RTS moves the strength loads set by set, and the check-ins move the
 * landmarks on evidence. Progression comes from those, not from a curve
 * laid down before the block started.
 *
 * The week index and the block length went with it. They were the whole
 * reason this took five arguments, and keeping them as ignored
 * parameters would have left every call site claiming a dependency that
 * no longer exists.
 */
/** Which tier a member sits in. Unplaced members are treated as bottom. */
export function tierRankOf<T extends string>(tiers: readonly Tier<T>[], member: T): number {
  return tiers.find((tier) => tier.members.includes(member))?.rank ?? tiers.length
}

/**
 * The target for one member of a tier list — position *and* reach.
 *
 * The only entry point callers should use. {@link weeklyTargetFor} is the
 * primitive underneath it and knows nothing about frequency, which is
 * exactly the gap this closes: a position says how hard to push inside a
 * band, and a rank says how many sessions there are to push in. Both are
 * needed and only one of them was being asked.
 *
 * Written as one function rather than a clamp each caller applies because
 * there are three call sites — the assembler, the explanation and the tier
 * editor — and a rule living in each of them is a rule the next one will
 * miss. That failure would be quiet in the worst way: the editor would
 * promise thirteen sets, the assembler would deliver ten, and the Plan
 * screen would report the difference as the lifter's week being too
 * small.
 */
export function weeklyTargetForMember<T extends string>(
  tiers: readonly Tier<T>[],
  member: T,
  landmarks: VolumeLandmarks,
  options: VolumeTargetOptions = {},
): number {
  const target = weeklyTargetFor(landmarks, priorityPosition(tiers, member), options)
  return Math.min(target, reachableWeeklySets(tierRankOf(tiers, member)))
}

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
      'front-delts',
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
   * Traps join them because nothing in a four-day week is short of pulling.
   *
   * Worth being exact, because "maintaining" is easy to read as "a little
   * bit of work". It is a *volume* tier: it decides how much dedicated
   * work the week schedules, and at the bottom the answer is what the
   * competition lifts already pay and nothing more.
   */
  {
    rank: 3,
    members: ['quads', 'hamstrings', 'glutes', 'core', 'forearms', 'traps'],
    label: 'Maintaining',
  },
]

/* -------------------------------------------------------------------- */

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

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
