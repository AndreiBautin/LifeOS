import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import {
  priorityPosition,
  spreadFactor,
  weeklyTargetFor,
  type MuscleTiers,
  type StrengthLift,
  type StrengthTiers,
} from '@/domain/priority/tiers'
import { MAIN_LIFT_LABELS } from '@/domain/splits/split'
import type { LandmarkSet } from '@/domain/volume/landmarks'
import { Badge, Card } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

/**
 * Assigning tiers, and showing what they cost.
 *
 * Tapping a tier is easy; understanding what it *does* is the hard part,
 * so the resulting weekly set target is shown next to every muscle and
 * updates as the tiers move. Without that, a lifter promoting a fourth
 * muscle to tier 1 sees nothing happen — when in fact they have just
 * diluted the other three, because the spread factor falls as the top
 * tier fills up.
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
  const spread = spreadFactor(muscleTiers)

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
    const next: StrengthTiers = Array.from({ length: 2 }, (_unused, index) => {
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
          {(['squat', 'bench', 'deadlift'] as const).map((lift) => (
            <li key={lift} className="flex items-center justify-between gap-3">
              <span className="text-ink-300 text-sm">{MAIN_LIFT_LABELS[lift]}</span>
              <div className="flex gap-1">
                {[1, 2].map((rank) => (
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
          A prioritised lift earns a higher fatigue target — more back-off volume after the top set
          — while a maintained one gets the top set and little else.
        </p>
      </Card>

      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="text-ink-50 text-sm font-semibold">Muscles</h3>
          <Badge tone={spread > 0.7 ? 'good' : spread > 0.45 ? 'warn' : 'bad'}>
            {spread > 0.7 ? 'focused' : spread > 0.45 ? 'moderate' : 'diluted'}
          </Badge>
        </div>

        <p className="text-ink-500 mb-3 text-xs">
          {spread > 0.7
            ? 'A small top tier means the rest of the body subsidises it, so your priorities can be pushed close to their ceiling.'
            : spread > 0.45
              ? 'A moderately sized top tier. Priorities get more than the rest, but not by much.'
              : 'Almost everything is prioritised, which means nothing is. Targets are compressed toward the middle of every band — move some muscles down to make the top tier mean something.'}
        </p>

        <ul className="space-y-1.5">
          {MUSCLE_GROUPS.map((muscle) => {
            const rank = rankOf(muscle)
            const target = weeklyTargetFor(landmarks[muscle], priorityPosition(muscleTiers, muscle))

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
