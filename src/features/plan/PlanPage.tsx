import { Link } from 'react-router-dom'

import { useSettings } from '@/app/context'
import { explainVolume, type Band, type MuscleAllocation } from '@/domain/priority/explain'
import { Badge, Card, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { cn } from '@/lib/cn'

import { useProgram } from '@/features/train/hooks'
import { RtsExplainer } from './RtsExplainer'

/**
 * What the block is doing to you, and why.
 *
 * The tier editor answers "what did I choose"; this answers "what did
 * that cost". They are different questions and the second is the one a
 * lifter asks when a session feels wrong — is my chest low because I set
 * it low, or because something else ate the budget?
 *
 * Every number here is shown with its derivation. A weekly set target
 * with no visible cause is unfalsifiable: there is no way to tell a
 * deliberate allocation from a bug, and no way to know which input to
 * change to move it.
 */

const BAND_TONE: Record<Band, 'accent' | 'good' | 'neutral'> = {
  specialising: 'accent',
  building: 'good',
  maintaining: 'neutral',
}

export function PlanPage() {
  const { settings } = useSettings()
  const program = useProgram()

  const plan = explainVolume(settings.muscleTiers, settings.strengthTiers, settings.landmarks)

  const byTier = [1, 2, 3].map((rank) => ({
    rank,
    label: plan.muscles.find((entry) => entry.tier === rank)?.tierLabel ?? `Tier ${String(rank)}`,
    muscles: plan.muscles
      .filter((entry) => entry.tier === rank)
      .sort((a, b) => b.weeklySets - a.weeklySets),
  }))

  const running = program.data

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Plan</h1>
        <p className="text-ink-500 mt-0.5 text-sm">{running?.name ?? 'Loading…'}</p>
      </header>

      <Section title="The block itself">
        <Link to="/program" className={cn(buttonStyles({ variant: 'primary' }), 'w-full')}>
          See every week, with the weights it would give you
        </Link>
      </Section>

      <Section title="The three lifts" description="Strength work, run by RTS">
        <Card>
          <ul className="space-y-3">
            {plan.lifts.map((lift) => (
              <li key={lift.lift}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-50 text-sm font-medium">{lift.label}</span>
                  <Badge tone={lift.tier === 1 ? 'accent' : 'neutral'}>Tier {lift.tier}</Badge>
                </div>
                <p className="text-ink-500 mt-0.5 text-xs">{lift.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      {byTier.map((tier) =>
        tier.muscles.length === 0 ? null : (
          <Section
            key={tier.rank}
            title={`Tier ${String(tier.rank)} — ${tier.label}`}
            description={`${String(tier.muscles.reduce((total, entry) => total + entry.weeklySets, 0))} hard sets a week across ${String(tier.muscles.length)} muscles`}
          >
            <Card>
              <ul className="space-y-3">
                {tier.muscles.map((muscle) => (
                  <MuscleRow key={muscle.muscle} allocation={muscle} />
                ))}
              </ul>
            </Card>
          </Section>
        ),
      )}

      <RtsExplainer />

      <Section title="Change any of it">
        <Card className="space-y-3">
          <p className="text-ink-300 text-sm">
            These numbers come from three inputs: which tier each muscle is in, the landmark band
            for that muscle, and nothing else. Both are in Settings.
          </p>
          <Link to="/settings" className={cn(buttonStyles({ variant: 'outline' }), 'w-full')}>
            Edit priorities and landmarks
          </Link>
        </Card>
      </Section>
    </div>
  )
}

function MuscleRow({ allocation }: { readonly allocation: MuscleAllocation }) {
  const { landmarks: marks, weeklySets } = allocation

  // Where the target sits across the full MV→MRV range, for the bar.
  const span = Math.max(1, marks.mrv - marks.mv)
  const fill = Math.max(0, Math.min(1, (weeklySets - marks.mv) / span))
  const mevMark = Math.max(0, Math.min(1, (marks.mev - marks.mv) / span))
  const mavMark = Math.max(0, Math.min(1, (marks.mav - marks.mv) / span))

  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-50 text-sm font-medium">{allocation.label}</span>
        <span className="numeric text-ink-50 text-sm font-semibold">
          {weeklySets}
          <span className="text-ink-500 font-normal"> sets</span>
        </span>
      </div>

      {/* MV at the left, MRV at the right, with MEV and MAV marked. */}
      <div className="bg-ink-850 relative mt-1.5 h-2 overflow-hidden rounded-full">
        <div
          className={cn(
            'h-full rounded-full',
            BAND_TONE[allocation.band] === 'accent'
              ? 'bg-accent-500'
              : BAND_TONE[allocation.band] === 'good'
                ? 'bg-good-500'
                : 'bg-ink-700',
          )}
          style={{ width: `${String(Math.round(fill * 100))}%` }}
        />
        <span
          className="bg-ink-500/70 absolute top-0 h-full w-px"
          style={{ left: `${String(Math.round(mevMark * 100))}%` }}
          aria-hidden
        />
        <span
          className="bg-ink-500/70 absolute top-0 h-full w-px"
          style={{ left: `${String(Math.round(mavMark * 100))}%` }}
          aria-hidden
        />
      </div>

      <div className="text-ink-500 numeric mt-1 flex justify-between text-[11px]">
        <span>MV {marks.mv}</span>
        <span>MEV {marks.mev}</span>
        <span>MAV {marks.mav}</span>
        <span>MRV {marks.mrv}</span>
      </div>

      <p className="text-ink-500 mt-1 text-xs">{allocation.reason}</p>
    </li>
  )
}
