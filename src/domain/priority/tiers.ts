import { invariant } from '@/domain/errors/domain-error'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { VolumeLandmarks } from '@/domain/volume/landmarks'

/**
 * Tier-based prioritisation.
 *
 * Replaces ramping volume targets across cycles. The lifter states what
 * matters — tier 1 is highest — and the tier structure decides where each
 * muscle sits inside its own landmark band.
 *
 * The part that makes this more than a lookup table is that **the shape of
 * the tier list changes how aggressive the mapping is allowed to be.**
 * Prioritising two things means the rest of the body subsidises them, and
 * you can afford to push those two close to MRV. Prioritising nine things
 * means nobody is subsidising anything, and pushing them all toward MRV
 * just buys a stalled block and a premature deload. So the same tier-1
 * membership produces a different target depending on how many others
 * share it and how the remainder is spread.
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
 * How far toward the extremes the tier structure permits, 0–1.
 *
 * 1 means "spend freely": the top tier can sit near MRV and the bottom
 * near MV. 0 means "everything lands mid-band" — the correct answer when
 * priority is so evenly spread that it is not really priority at all.
 *
 * Two things pull it down:
 *
 *   - **A crowded top tier.** Blasting two muscles is a strategy;
 *     blasting eight is just a high-volume block with extra steps.
 *   - **A flat structure.** One tier holding everything expresses no
 *     preference, so the mapping should express none either.
 */
export function spreadFactor<T extends string>(tiers: readonly Tier<T>[]): number {
  const populated = tiers.filter((tier) => tier.members.length > 0)
  const total = populated.reduce((sum, tier) => sum + tier.members.length, 0)

  if (total === 0) return 0
  // A single tier is a statement that nothing is prioritised. Honour it.
  if (populated.length < 2) return 0

  const ordered = [...populated].sort((a, b) => a.rank - b.rank)
  const topShare = (ordered[0]?.members.length ?? 0) / total

  // A top tier holding a fifth of the roster or less is a real
  // priority call and earns the full range; at half the roster or more
  // the word has stopped meaning anything.
  const concentration = clamp01((0.5 - topShare) / (0.5 - 0.2))

  // More tiers means finer gradation, but each step is smaller — a
  // five-tier structure is a considered ordering, not five extremes.
  const granularity = clamp01((populated.length - 1) / 3)

  // Concentration dominates: it is the one that says how much of the
  // body is available to subsidise the priority.
  return clamp01(0.25 + 0.6 * concentration + 0.15 * granularity)
}

/**
 * A muscle's position in its own band, 0 (MV) to 1 (just under MRV).
 *
 * Returned as a position rather than a set count so the caller can decide
 * what to do with it — the same position means different absolute volumes
 * for calves and for quads, which is the entire point of per-muscle
 * landmarks.
 */
export function priorityPosition<T extends string>(tiers: readonly Tier<T>[], member: T): number {
  const populated = tiers.filter((tier) => tier.members.length > 0)
  const ordered = [...populated].sort((a, b) => a.rank - b.rank)

  const index = ordered.findIndex((tier) => tier.members.includes(member))
  // Anything not placed in a tier is treated as lowest priority rather
  // than as an error: a new muscle group should not break a program.
  if (index === -1) return neutralPosition(0)

  // Rank within the ordering, 1 at the top down to 0 at the bottom.
  const rankScore = ordered.length === 1 ? 0.5 : 1 - index / (ordered.length - 1)

  const k = spreadFactor(tiers)
  return clamp01(0.5 + k * (rankScore - 0.5))
}

function neutralPosition(k: number): number {
  return clamp01(0.5 - k * 0.5)
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
/* Ramping into position                                                 */
/* -------------------------------------------------------------------- */

/**
 * The target for a specific week of a block.
 *
 * A prioritised muscle does not start at its ceiling — it climbs to it.
 * Starting at the top wastes the block's most productive weeks on volume
 * you were already adapted to, and leaves nowhere to go when progress
 * stalls. So week one opens near MEV and the target is approached over
 * the working weeks, arriving at it in the last week before the deload.
 *
 * The deload week itself drops to maintenance.
 */
export function weeklyTargetForWeek(
  landmarks: VolumeLandmarks,
  position: number,
  weekIndex: number,
  workingWeeks: number,
  isDeload: boolean,
): number {
  if (isDeload) return Math.max(0, Math.round(landmarks.mv))

  const peak = weeklyTargetFor(landmarks, position, {
    // The final working week is the overreach: the one week where
    // touching MRV is deliberate, because a deload follows it.
    overreach: workingWeeks > 1 && weekIndex === workingWeeks - 1,
  })

  // Open at MEV, or at the peak itself when the peak is below MEV — a
  // deprioritised muscle should not start above where it is going.
  const start = Math.min(peak, landmarks.mev)
  if (workingWeeks <= 1) return Math.round(peak)

  const progress = clamp01(weekIndex / (workingWeeks - 1))
  return Math.max(0, Math.round(lerp(start, peak, progress)))
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
  { rank: 1, members: ['bench'], label: 'Specialising' },
  { rank: 2, members: ['squat', 'deadlift'], label: 'Building' },
  { rank: 3, members: [], label: 'Maintaining' },
]

export const DEFAULT_MUSCLE_TIERS: MuscleTiers = [
  {
    rank: 1,
    members: ['biceps', 'triceps', 'forearms', 'side-delts'],
    label: 'Specialising',
  },
  // Front delts sit here rather than in the bottom tier so the overhead
  // press keeps a real allocation. Its primary muscle is what decides how
  // many sets it gets, and at tier 3 a lift meant to stay in the rotation
  // was receiving maintenance volume.
  { rank: 2, members: ['lats', 'upper-back', 'chest', 'front-delts'], label: 'Building' },
  {
    rank: 3,
    members: ['rear-delts', 'quads', 'hamstrings', 'glutes', 'calves', 'core'],
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
