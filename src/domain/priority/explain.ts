import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'
import type { MuscleTiers, StrengthLift, StrengthTiers } from '@/domain/priority/tiers'
import {
  strengthSessionsFor,
  STRENGTH_LIFT_LABELS,
  STRENGTH_LIFTS,
  weeklyTargetForMember,
} from '@/domain/priority/tiers'
import { MAX_FREQUENCY, requiredFrequency } from '@/domain/volume/frequency'
import type { LandmarkSet, VolumeLandmarks } from '@/domain/volume/landmarks'

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
  /** How many muscles sit in the top tier. Reported, never applied. */
  readonly prioritisedCount: number
  readonly totalWeeklySets: number
}

/**
 * A name and a description generated from the tiers themselves.
 *
 * Written by hand, these went stale the first time a tier moved: the
 * block still called itself "arms and side delts" after front delts were
 * promoted, and claimed everything else was maintained after the squat
 * and deadlift were moved up to building. A description that describes
 * the wrong program is worse than none — it is the one thing in the app a
 * lifter has no way to check.
 */
export function describeBlock(
  muscleTiers: MuscleTiers,
  strengthTiers: StrengthTiers,
): {
  readonly name: string
  readonly description: string
  readonly focus: { readonly muscles: string; readonly lifts?: string }
} {
  const list = (values: readonly string[]): string => {
    if (values.length === 0) return 'nothing'
    if (values.length === 1) return values[0] ?? ''
    return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1] ?? ''}`
  }

  /*
   * Muscles that are always trained together read better as one word.
   *
   * "Biceps, triceps, forearms and side delts" is accurate and unusable
   * as a title. Collapsing the set only when *all* of it is present keeps
   * it honest — prioritising biceps alone still says biceps.
   */
  const GROUPS: readonly { readonly members: readonly MuscleGroup[]; readonly label: string }[] = [
    { members: ['biceps', 'triceps', 'forearms'], label: 'arms' },
    { members: ['quads', 'hamstrings', 'glutes', 'calves'], label: 'legs' },
    { members: ['lats', 'upper-back'], label: 'back' },
  ]

  const musclesAt = (rank: number): string[] => {
    const members = muscleTiers.find((tier) => tier.rank === rank)?.members ?? []
    const remaining = new Set(members)
    const named: string[] = []

    for (const group of GROUPS) {
      if (!group.members.every((muscle) => remaining.has(muscle))) continue
      for (const muscle of group.members) remaining.delete(muscle)
      named.push(group.label)
    }

    return [
      ...named,
      ...members
        .filter((muscle) => remaining.has(muscle))
        .map((muscle) => MUSCLE_GROUP_LABELS[muscle].toLowerCase()),
    ]
  }

  const liftsAt = (rank: number): string[] =>
    (strengthTiers.find((tier) => tier.rank === rank)?.members ?? []).map((lift) =>
      STRENGTH_LIFT_LABELS[lift].toLowerCase(),
    )

  const top = musclesAt(1)
  const middle = musclesAt(2)
  const bottom = musclesAt(3)
  const leadLifts = liftsAt(1)

  const sentences = [
    /*
     * Both abbreviated, rather than one of each.
     *
     * This read "Renaissance Periodization volume with RTS autoregulated
     * strength", which spells out one training system and initialises the
     * other in the same breath — the inconsistency is the kind of thing
     * that reads as carelessness even when nobody can say why.
     *
     * Abbreviating both wins over expanding both because this is the
     * first of five sentences, and the alternative front-loads eight
     * words of proper noun before the reader reaches anything about their
     * own program. Both initialisms are standard in the field, and RTS
     * gets a full explanation further down the same screen.
     */
    'RP volume with RTS autoregulated strength on the three lifts.',
    top.length > 0 ? `${sentenceCase(list(top))} specialised.` : '',
    middle.length > 0 ? `${sentenceCase(list(middle))} building.` : '',
    bottom.length > 0 ? `${sentenceCase(list(bottom))} maintained.` : '',
    leadLifts.length > 0
      ? `${sentenceCase(list(leadLifts))} ${leadLifts.length === 1 ? 'leads' : 'lead'} the strength work.`
      : '',
  ].filter((sentence) => sentence !== '')

  /*
   * The title carries both focuses, because a block has two.
   *
   * "Arms and side delts" describes where the volume went and says
   * nothing about where the strength went — and the strength tiers are a
   * separate decision the lifter made, on a separate screen, that changes
   * how the week actually feels. A block leading with the bench and one
   * leading with the deadlift are different blocks under the same name.
   */
  const muscleFocus = top.length > 0 ? sentenceCase(list(top)) : 'General'
  const liftFocus = leadLifts.length > 0 ? `${sentenceCase(list(leadLifts))} strength` : undefined

  return {
    // No 'RP block' prefix. Everything here is RP volume with RTS
    // strength, so naming it that distinguishes the block from nothing.
    name: liftFocus === undefined ? muscleFocus : `${muscleFocus} · ${liftFocus}`,
    description: sentences.join(' '),
    /*
     * The two halves, unjoined.
     *
     * `name` is an identity — it belongs in a title bar, and the
     * interpunct is doing the work of "and also". A screen with room to
     * lay the block out properly should not have to split that string
     * back apart to label the halves, and one that tries will get it
     * wrong the first time a muscle group's name contains a separator.
     */
    focus: {
      muscles: muscleFocus,
      ...(liftFocus === undefined ? {} : { lifts: sentenceCase(list(leadLifts)) }),
    },
  }
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/*
 * The band is the tier under another name, and saying so is the point.
 *
 * It used to be read back out of a position between 0 and 1 — the tier
 * chose a position and the position chose a band — so a muscle could sit
 * in tier 2 and be described as "specialising" if the numbers happened to
 * land there. Two vocabularies for one decision, kept in step by
 * arithmetic. A tier *is* a band now.
 */
function bandForRank(rank: number): Band {
  if (rank === 1) return 'specialising'
  if (rank === 2) return 'building'
  return 'maintaining'
}

/** What each tier's number means, said in words rather than as a range. */
const BAND_MEANING: Record<Band, (marks: VolumeLandmarks) => string> = {
  specialising: (marks) => `maximum recoverable volume, ${String(marks.mrv)} sets`,
  building: (marks) => `minimum effective volume, ${String(marks.mev)} sets`,
  maintaining: () => 'no dedicated work',
}

export function explainVolume(
  muscleTiers: MuscleTiers,
  strengthTiers: StrengthTiers,
  landmarks: LandmarkSet,
): VolumePlan {
  const tierCount = muscleTiers.length

  const muscles = MUSCLE_GROUPS.map((muscle): MuscleAllocation => {
    const tier = muscleTiers.find((candidate) => candidate.members.includes(muscle))
    const rank = tier?.rank ?? tierCount
    const marks = landmarks[muscle]
    const weeklySets = weeklyTargetForMember(muscleTiers, muscle, marks)
    const band = bandForRank(rank)
    const sessions = requiredFrequency(rank, MAX_FREQUENCY)

    /*
     * The whole derivation in one sentence, because there is now only
     * one sentence's worth of it.
     *
     * It named the band the target was "pushed toward the top of" or
     * "held near the bottom of", which honestly described an
     * interpolation and is a strange thing to say about a lookup. It also
     * reported how many muscles shared the tier — left over from when
     * that changed the number, which it has not done for a long time.
     */
    return {
      muscle,
      label: MUSCLE_GROUP_LABELS[muscle],
      tier: rank,
      tierLabel: tier?.label ?? `Tier ${String(rank)}`,
      weeklySets,
      landmarks: { mv: marks.mv, mev: marks.mev, mav: marks.mav, mrv: marks.mrv },
      band,
      reason:
        `Tier ${String(rank)} of ${String(tierCount)}: ${BAND_MEANING[band](marks)}` +
        (sessions > 0
          ? ` a week over ${String(sessions)} sessions — ${String(Math.round(weeklySets / sessions))} each.`
          : ', so nothing is scheduled for it — what the competition lifts pay it is what it gets.'),
    }
  })

  const lifts = STRENGTH_LIFTS.map((lift): StrengthAllocation => {
    const tier = strengthTiers.find((candidate) => candidate.members.includes(lift))
    const rank = tier?.rank ?? 2
    const sessions = strengthSessionsFor(strengthTiers, lift)

    return {
      lift,
      label: STRENGTH_LIFT_LABELS[lift],
      tier: rank,
      /*
       * Only what differs between lifts.
       *
       * These sentences used to describe a tier-dependent fatigue
       * allowance — "the highest fatigue target, so the most back-off
       * volume" — which stopped being true when the allowance was
       * flattened to match the load drop. The replacement then explained
       * the flat rule on every row, which is worse in a different way:
       * three identical sentences train the reader to skip all three,
       * including the number that is not identical. What every session
       * shares belongs above the list, once.
       */
      reason: `${
        rank === 1 ? 'Specialising' : rank === 2 ? 'Building' : 'Maintaining'
      }: ${String(sessions)} session${sessions === 1 ? '' : 's'} a week.`,
    }
  })

  return {
    muscles,
    lifts,
    prioritisedCount: muscleTiers.find((tier) => tier.rank === 1)?.members.length ?? 0,
    totalWeeklySets: muscles.reduce((total, entry) => total + entry.weeklySets, 0),
  }
}
