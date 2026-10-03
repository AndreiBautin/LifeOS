import { Trophy } from 'lucide-react'

import { Link } from 'react-router-dom'
import { useServices, useSettings } from '@/app/context'
import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId } from '@/domain/ids/ids'
import { strengthStandings, type LiftStanding } from '@/domain/strength/standards'
import { projectReach } from '@/domain/strength/projection'
import { strengthTrend, type TrendLift } from '@/domain/strength/trend'
import { toDayKey } from '@/domain/time/day'
import { Button, Card, CardHeading } from '@/components/shared/primitives'

import { useRecentWorkouts } from './hooks'

/**
 * Where each lift stands against the published bodyweight standards: the
 * estimated max, its multiple of bodyweight, and how far it is through
 * the band to the next standard, with the load that reaches it.
 *
 * **The bar is back, and it is not the one the game had.** That drew a
 * rank per lift — Untrained to Elite — and a meter to the next rank. The
 * ranks stay gone; the bar runs between two published multiples, so it
 * measures the lift against a fixed external scale and nothing the app
 * chose. It was plain text rows for a while, which was honest and was the
 * flattest card on the page.
 *
 * Each lift wears the colour the strength-over-time chart gives it, so
 * the two cards read as one subject.
 */
const LIFT_COLOURS: Readonly<Record<string, string>> = {
  Squat: 'var(--color-accent-400)',
  'Bench press': 'var(--color-cool-500)',
  Deadlift: 'var(--color-warn-500)',
}

/** The card's row names, as the trend names the same lifts. */
const TREND_LIFT: Readonly<Record<string, TrendLift>> = {
  Squat: 'squat',
  'Bench press': 'bench',
  Deadlift: 'deadlift',
}

/**
 * Below this the two figures are the same number rounded twice, and an
 * offer to swap one for the other would be noise on every row.
 */
const DRIFT = 5

export function StrengthStandards() {
  const { settings, update } = useSettings()
  /*
   * **The card and the chart beneath it read two different numbers**, and
   * nothing said so: the card is the estimated max you keep in Settings,
   * which every suggested load is planned from; the chart is what your
   * sessions measure. Squat 353 above a chart ending at 356 read as a bug.
   * Where they part by more than rounding, the row names the measured
   * figure and offers it — **offered, never applied**, the stance the
   * session report's own "use this estimate" takes, because the stored
   * max moves every first-session load and must move only when asked.
   */
  const workouts = useRecentWorkouts(200)
  const trend = workouts.data === undefined ? undefined : strengthTrend(workouts.data)
  /*
   * **When the next standard arrives at this rate**, from the trend's own
   * last twelve weeks (`projectReach`). Said only when the evidence holds
   * it — four sessions over four weeks, a rising line, and inside a year.
   */
  const today = toDayKey(useServices().clock.now())
  const reachFor = (standing: LiftStanding): string | undefined => {
    const lift = TREND_LIFT[standing.name]
    const target = standing.next?.load
    if (lift === undefined || target === undefined || trend === undefined) return undefined
    return projectReach(trend[lift], target, today)
  }
  const measuredFor = (name: string): number | undefined => {
    const lift = TREND_LIFT[name]
    return lift === undefined ? undefined : trend?.[lift].at(-1)?.value
  }

  const { lifts, total } = strengthStandings({
    estimatedMaxes: settings.estimatedMaxes,
    ...(settings.bodyweight !== undefined ? { bodyweight: settings.bodyweight } : {}),
  })

  return (
    <Card>
      <CardHeading
        icon={<Trophy size={16} aria-hidden />}
        title="Strength"
        action={
          <Link viewTransition to="/records" className="text-accent-400 text-xs hover:underline">
            All records →
          </Link>
        }
      />

      <ul className="space-y-4">
        {/*
          The total is a row like the lifts, not a headline: the hero already
          states it, and this card is where it is measured.
        */}
        <LiftRow standing={total} colour="var(--color-ink-100)" />
        {lifts.map((lift) => (
          <LiftRow
            key={lift.name}
            standing={lift}
            colour={LIFT_COLOURS[lift.name] ?? 'var(--color-accent-400)'}
            measured={measuredFor(lift.name)}
            reach={reachFor(lift)}
            today={today}
            onUse={(value) => {
              const trendLift = TREND_LIFT[lift.name]
              if (trendLift === undefined) return
              update({
                estimatedMaxes: {
                  ...settings.estimatedMaxes,
                  [asExerciseId(STRENGTH_LIFT_SLUGS[trendLift])]: value,
                },
              })
            }}
          />
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

/** "December", or "March 2027" once it is another year. */
function whenOf(day: string, today: string): string {
  const date = new Date(`${day}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    month: 'long',
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
  })
}

function LiftRow({
  standing,
  colour,
  measured,
  reach,
  today,
  onUse,
}: {
  readonly standing: LiftStanding
  readonly colour: string
  readonly reach?: string | undefined
  readonly today?: string
  readonly measured?: number | undefined
  readonly onUse?: (value: number) => void
}) {
  const drifted =
    measured !== undefined &&
    onUse !== undefined &&
    (standing.max === undefined || Math.abs(measured - standing.max) >= DRIFT)

  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-100 flex items-center gap-2 text-sm font-medium">
          <span className="size-2 rounded-full" style={{ background: colour }} aria-hidden />
          {standing.name}
        </span>
        <span className="numeric text-ink-50 text-sm font-semibold">
          {standing.max === undefined ? '—' : `${String(Math.round(standing.max))} lb`}
          {standing.multiple !== undefined && (
            <span className="text-ink-500 font-normal"> · {standing.multiple.toFixed(2)}×</span>
          )}
        </span>
      </div>
      <Band standing={standing} colour={colour} />
      {reach !== undefined && standing.next !== undefined && today !== undefined && (
        <p className="text-ink-500 mt-0.5 text-right text-[0.7rem]">
          At this rate, {standing.next.multiple}× around{' '}
          <span className="text-ink-300">{whenOf(reach, today)}</span>
        </p>
      )}
      {drifted && (
        <div className="border-ink-800 mt-2 flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-1.5">
          <span className="text-ink-500 text-xs">
            Your sessions measure{' '}
            <span className="numeric text-ink-100 font-semibold">{measured} lb</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Use ${String(measured)} lb as your ${standing.name.toLowerCase()} max`}
            onClick={() => {
              onUse(measured)
            }}
          >
            Use it
          </Button>
        </div>
      )}
    </li>
  )
}

/**
 * The band from the standard reached to the next one, filled to where the
 * lift sits in it. Past the top standard there is no band to be through,
 * so it draws full and says so.
 */
function Band({ standing, colour }: { readonly standing: LiftStanding; readonly colour: string }) {
  if (standing.multiple === undefined) return null

  const from = standing.reached ?? 0
  const to = standing.next?.multiple
  const share = to === undefined ? 1 : Math.min(1, (standing.multiple - from) / (to - from))

  return (
    <div className="mt-2">
      <div
        className="bg-ink-800 h-1.5 overflow-hidden rounded-full"
        role="meter"
        aria-valuemin={from}
        aria-valuemax={to ?? standing.multiple}
        aria-valuenow={standing.multiple}
        aria-label={`${standing.name}: ${standing.multiple.toFixed(2)} times bodyweight`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${String(Math.max(0.04, share) * 100)}%`,
            background: `linear-gradient(90deg, color-mix(in oklab, ${colour} 55%, transparent), ${colour})`,
          }}
        />
      </div>
      <p className="text-ink-500 numeric mt-1 flex justify-between text-[0.7rem]">
        <span>{from}×</span>
        {standing.next === undefined ? (
          <span>Top standard reached</span>
        ) : (
          <span>
            Next {standing.next.multiple}× ·{' '}
            <span className="text-ink-300">{standing.next.load} lb</span>
          </span>
        )}
      </p>
    </div>
  )
}
