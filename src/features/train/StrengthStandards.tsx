import { Trophy } from 'lucide-react'

import { useSettings } from '@/app/context'
import { strengthStandings, type LiftStanding } from '@/domain/strength/standards'
import { Card, CardHeading } from '@/components/shared/primitives'

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

export function StrengthStandards() {
  const { settings } = useSettings()

  const { lifts, total } = strengthStandings({
    estimatedMaxes: settings.estimatedMaxes,
    ...(settings.bodyweight !== undefined ? { bodyweight: settings.bodyweight } : {}),
  })

  return (
    <Card>
      <CardHeading icon={<Trophy size={16} aria-hidden />} title="Strength" />

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

function LiftRow({
  standing,
  colour,
}: {
  readonly standing: LiftStanding
  readonly colour: string
}) {
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
