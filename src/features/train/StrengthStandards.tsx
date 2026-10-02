import { Plus, Trophy } from 'lucide-react'

import { useSettings } from '@/app/context'
import { strengthStandings, type LiftStanding } from '@/domain/strength/standards'
import { Button, Card, CardHeading } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

import { useStartWorkout } from './hooks'

/**
 * Where each lift stands against the published bodyweight standards, as
 * plain numbers: the estimated max, the multiple of bodyweight, and the
 * next standard with the load that would reach it.
 *
 * **No badges and no bars.** It drew a rank per lift — Untrained to Elite
 * — with a meter to the next one, as part of a character sheet. The ranks
 * went with the rest of the game; what was always a measurement stayed.
 */
export function StrengthStandards() {
  const { settings } = useSettings()

  const { lifts, total } = strengthStandings({
    estimatedMaxes: settings.estimatedMaxes,
    ...(settings.bodyweight !== undefined ? { bodyweight: settings.bodyweight } : {}),
  })

  return (
    <Card>
      <CardHeading icon={<Trophy size={16} aria-hidden />} title="Strength" />
      <ul className="space-y-3">
        <StandardRow standing={total} emphasis />
        {lifts.map((lift) => (
          <StandardRow key={lift.name} standing={lift} />
        ))}
      </ul>
      {settings.bodyweight === undefined && (
        <p className="text-ink-500 mt-3 text-xs">
          Set your bodyweight in Settings — the standards are multiples of it.
        </p>
      )}
    </Card>
  )
}

function StandardRow({
  standing,
  emphasis,
}: {
  readonly standing: LiftStanding
  readonly emphasis?: boolean
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            'text-sm',
            emphasis === true ? 'text-ink-50 font-semibold' : 'text-ink-300 font-medium',
          )}
        >
          {standing.name}
        </span>
        <span className="numeric text-ink-50 text-sm font-semibold">
          {standing.max === undefined ? '—' : `${String(Math.round(standing.max))} lb`}
          {standing.multiple !== undefined && (
            <span className="text-ink-500 font-normal"> · {standing.multiple.toFixed(2)}×</span>
          )}
        </span>
      </div>
      {standing.next !== undefined && (
        <p className="text-ink-500 numeric mt-0.5 text-xs">
          Next standard {standing.next.multiple}× bodyweight · {standing.next.load} lb
        </p>
      )}
    </li>
  )
}

/**
 * A session with no programme day behind it — for the day that does not
 * fit the routine. Like starting the planned one, it does not navigate:
 * the page becomes the player once the workout exists.
 */
export function LogFromScratch() {
  const startWorkout = useStartWorkout()

  return (
    <Button
      variant="outline"
      full
      disabled={startWorkout.isPending}
      onClick={() => {
        startWorkout.mutate(
          { freestyleTitle: 'Open session' },
          {
            onSuccess: () => {
              window.scrollTo({ top: 0 })
            },
          },
        )
      }}
    >
      <Plus size={18} aria-hidden />
      Log a session from scratch
    </Button>
  )
}
