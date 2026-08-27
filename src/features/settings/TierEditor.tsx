import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import {
  STRENGTH_LIFT_LABELS,
  STRENGTH_LIFTS,
  weeklyTargetForMember,
  type MuscleTiers,
  type StrengthLift,
  type StrengthTiers,
} from '@/domain/priority/tiers'

import type { LandmarkSet } from '@/domain/volume/landmarks'
import { Badge, Card } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

/**
 * Assigning tiers, and showing what they cost.
 *
 * Tapping a tier is easy; understanding what it *does* is the hard part,
 * so the resulting weekly set target is shown next to every muscle and
 * updates as the tiers move.
 *
 * Promoting a muscle now moves that muscle's number and nothing else.
 * It used to move all of them — a fourth muscle in tier 1 quietly
 * diluted the other three — and this panel carried a badge grading how
 * focused the structure was, which was really a warning about a rule
 * that should not have existed. Whether the total fits in a week is a
 * separate question, answered on the Plan screen against the program the
 * assembler actually builds.
 */

const TIER_COUNT = 3

const TIER_LABELS = ['Specialising', 'Building', 'Maintaining'] as const

interface Props {
  readonly muscleTiers: MuscleTiers
  readonly strengthTiers: StrengthTiers
  readonly landmarks: LandmarkSet
  readonly onMuscleTiers: (tiers: MuscleTiers) => void
  readonly onStrengthTiers: (tiers: StrengthTiers) => void
}

export function TierEditor({
  muscleTiers,
  strengthTiers,
  landmarks,
  onMuscleTiers,
  onStrengthTiers,
}: Props) {
  const rankOf = (muscle: MuscleGroup): number =>
    muscleTiers.find((tier) => tier.members.includes(muscle))?.rank ?? TIER_COUNT

  const setRank = (muscle: MuscleGroup, rank: number): void => {
    const next: MuscleTiers = Array.from({ length: TIER_COUNT }, (_unused, index) => {
      const tierRank = index + 1
      const existing = muscleTiers.find((tier) => tier.rank === tierRank)
      const members = (existing?.members ?? []).filter((member) => member !== muscle)

      return {
        rank: tierRank,
        members: tierRank === rank ? [...members, muscle] : members,
        label: TIER_LABELS[index] ?? `Tier ${String(tierRank)}`,
      }
    })

    onMuscleTiers(next)
  }

  const strengthRankOf = (lift: StrengthLift): number =>
    strengthTiers.find((tier) => tier.members.includes(lift))?.rank ?? 2

  const setStrengthRank = (lift: StrengthLift, rank: number): void => {
    const next: StrengthTiers = Array.from({ length: TIER_COUNT }, (_unused, index) => {
      const tierRank = index + 1
      const existing = strengthTiers.find((tier) => tier.rank === tierRank)
      const members = (existing?.members ?? []).filter((member) => member !== lift)

      return {
        rank: tierRank,
        members: tierRank === rank ? [...members, lift] : members,
      }
    })

    onStrengthTiers(next)
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-ink-50 text-sm font-semibold">The three lifts</h3>
          <Badge tone="accent">total</Badge>
        </div>

        <ul className="space-y-2">
          {STRENGTH_LIFTS.map((lift) => (
            <li key={lift} className="flex items-center justify-between gap-3">
              <span className="text-ink-300 text-sm">{STRENGTH_LIFT_LABELS[lift]}</span>
              <div className="flex gap-1">
                {[1, 2, 3].map((rank) => (
                  <TierButton
                    key={rank}
                    rank={rank}
                    active={strengthRankOf(lift) === rank}
                    onSelect={() => {
                      setStrengthRank(lift, rank)
                    }}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>

        <p className="text-ink-500 mt-3 text-xs">
          Three tiers, as with the muscles — and what they buy is sessions a week, not a longer
          session. Every lift stops at the same 5%, so a tier decides how often you meet it: three
          times, twice, or once.
        </p>
      </Card>

      <Card>
        <h3 className="text-ink-50 mb-1 text-sm font-semibold">Muscles</h3>

        <p className="text-ink-500 mb-3 text-xs">
          Three tiers, three numbers. Tier 1 is maximum recoverable volume, tier 2 is minimum
          effective volume, and tier 3 is no dedicated work at all — the competition lifts are what
          holds those up. Both trained tiers run twice a week, so a tier-1 muscle gets five sets a
          session and a tier-2 muscle three. Whether the total fits in your week is on the Plan
          screen.
        </p>

        <ul className="space-y-1.5">
          {MUSCLE_GROUPS.map((muscle) => {
            const rank = rankOf(muscle)
            const target = weeklyTargetForMember(muscleTiers, muscle, landmarks[muscle])

            return (
              <li key={muscle} className="flex items-center justify-between gap-3">
                <span className="text-ink-300 min-w-0 flex-1 truncate text-sm">
                  {MUSCLE_GROUP_LABELS[muscle]}
                </span>

                <span className="numeric text-ink-500 w-20 shrink-0 text-right text-xs">
                  {target} sets
                </span>

                <div className="flex shrink-0 gap-1">
                  {[1, 2, 3].map((candidate) => (
                    <TierButton
                      key={candidate}
                      rank={candidate}
                      active={rank === candidate}
                      onSelect={() => {
                        setRank(muscle, candidate)
                      }}
                    />
                  ))}
                </div>
              </li>
            )
          })}
        </ul>

        <p className="text-ink-500 mt-3 text-xs">
          Set counts are the peak of the block. Every muscle ramps up to its target over the working
          weeks rather than starting there.
        </p>
      </Card>
    </div>
  )
}

function TierButton({
  rank,
  active,
  onSelect,
}: {
  readonly rank: number
  readonly active: boolean
  readonly onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Tier ${String(rank)}`}
      aria-pressed={active}
      className={cn(
        'flex size-9 items-center justify-center rounded-lg border text-xs font-semibold transition-colors',
        active
          ? 'border-accent-500 bg-accent-500 text-black'
          : 'border-ink-800 bg-ink-850 text-ink-500 hover:border-ink-700',
      )}
    >
      {rank}
    </button>
  )
}
