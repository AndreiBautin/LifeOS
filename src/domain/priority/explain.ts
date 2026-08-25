import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'
import type { MuscleTiers, StrengthLift, StrengthTiers } from '@/domain/priority/tiers'
import {
  priorityPosition,
  spreadFactor,
  STRENGTH_LIFT_LABELS,
  STRENGTH_LIFTS,
  weeklyTargetFor,
} from '@/domain/priority/tiers'
import type { LandmarkSet } from '@/domain/volume/landmarks'

/**
 * Why each muscle is getting the volume it is getting.
 *
 * The tier editor shows the *number*, which is the easy half. The number
 * on its own is unfalsifiable: eighteen sets for biceps looks arbitrary
 * until you can see that it came from a tier-1 position inside an 8–22
 * band, pulled down because five other muscles share that tier. Without
 * the derivation the lifter cannot tell a considered allocation from a
 * bug, and cannot tell which input to change to move it.
 *
 * Pure, and separate from the UI, so the explanation is generated from
 * the same functions that produce the target rather than written
 * alongside them — a prose description maintained by hand would drift
 * from the maths on the first change.
 */

export type Band = 'maintaining' | 'building' | 'specialising'

export interface MuscleAllocation {
  readonly muscle: MuscleGroup
  readonly label: string
  readonly tier: number
  readonly tierLabel: string
  /** 0–1: where inside the landmark band this muscle's target sits. */
  readonly position: number
  readonly weeklySets: number
  readonly landmarks: {
    readonly mv: number
    readonly mev: number
    readonly mav: number
    readonly mrv: number
  }
  readonly band: Band
  /** One sentence naming every input that produced the number. */
  readonly reason: string
}

export interface StrengthAllocation {
  readonly lift: StrengthLift
  readonly label: string
  readonly tier: number
  readonly reason: string
}

export interface VolumePlan {
  readonly muscles: readonly MuscleAllocation[]
  readonly lifts: readonly StrengthAllocation[]
  /** How concentrated the tier structure is, 0–1. */
  readonly spread: number
  readonly spreadLabel: 'focused' | 'moderate' | 'diluted'
  readonly spreadReason: string
  readonly totalWeeklySets: number
}

function bandFor(position: number): Band {
  if (position >= 0.6) return 'specialising'
  if (position >= 0.3) return 'building'
  return 'maintaining'
}

const BAND_VERB: Record<Band, string> = {
  specialising: 'pushed toward the top of',
  building: 'set in the upper middle of',
  maintaining: 'held near the bottom of',
}

export function explainVolume(
  muscleTiers: MuscleTiers,
  strengthTiers: StrengthTiers,
  landmarks: LandmarkSet,
): VolumePlan {
  const spread = spreadFactor(muscleTiers)
  const tierCount = muscleTiers.length

  const muscles = MUSCLE_GROUPS.map((muscle): MuscleAllocation => {
    const tier = muscleTiers.find((candidate) => candidate.members.includes(muscle))
    const rank = tier?.rank ?? tierCount
    const position = priorityPosition(muscleTiers, muscle)
    const marks = landmarks[muscle]
    const weeklySets = weeklyTargetFor(marks, position)
    const band = bandFor(position)
    const shareSize = tier?.members.length ?? 0

    return {
      muscle,
      label: MUSCLE_GROUP_LABELS[muscle],
      tier: rank,
      tierLabel: tier?.label ?? `Tier ${String(rank)}`,
      position,
      weeklySets,
      landmarks: { mv: marks.mv, mev: marks.mev, mav: marks.mav, mrv: marks.mrv },
      band,
      reason:
        `Tier ${String(rank)} of ${String(tierCount)}` +
        (shareSize > 1 ? `, shared with ${String(shareSize - 1)} other` : '') +
        (shareSize > 2 ? 's' : '') +
        `. Target ${BAND_VERB[band]} the ${String(marks.mev)}–${String(marks.mrv)} band` +
        ` — ${String(weeklySets)} hard sets a week.`,
    }
  })

  const lifts = STRENGTH_LIFTS.map((lift): StrengthAllocation => {
    const tier = strengthTiers.find((candidate) => candidate.members.includes(lift))
    const rank = tier?.rank ?? 2

    return {
      lift,
      label: STRENGTH_LIFT_LABELS[lift],
      tier: rank,
      reason:
        rank === 1
          ? 'Prioritised: a higher fatigue target, so more back-off volume after the top set.'
          : 'Maintained: the top set and a short back-off, enough to hold the lift while something else grows.',
    }
  })

  const spreadLabel = spread > 0.7 ? 'focused' : spread > 0.45 ? 'moderate' : 'diluted'
  const topTier = muscleTiers.find((tier) => tier.rank === 1)?.members.length ?? 0

  return {
    muscles,
    lifts,
    spread,
    spreadLabel,
    spreadReason:
      spreadLabel === 'focused'
        ? `Only ${String(topTier)} muscles are prioritised, so the rest of the body subsidises them and their targets can sit near the ceiling.`
        : spreadLabel === 'moderate'
          ? `${String(topTier)} muscles are prioritised. They get more than the rest, but not dramatically more — there is only so much recovery to redistribute.`
          : `${String(topTier)} muscles are prioritised, which is most of the body. Every target is compressed toward the middle of its band: prioritising everything prioritises nothing.`,
    totalWeeklySets: muscles.reduce((total, entry) => total + entry.weeklySets, 0),
  }
}
