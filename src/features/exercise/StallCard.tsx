import { TrendingDown, Undo2 } from 'lucide-react'

import { useServices, useSettings } from '@/app/context'
import type { ExerciseSeries } from '@/domain/logging/exercise-history'
import {
  isStalled,
  resetKey,
  resetLoad,
  resetPending,
  sessionsWithoutProgress,
} from '@/domain/programs/stall'
import { formatLoad } from '@/domain/units/weight'
import { Button, Card } from '@/components/shared/primitives'

/**
 * A stalled exercise, said once, with the way out beside it.
 *
 * **Offered, never applied** — the stance the session report's estimate
 * and the Strength card's measured max both take. Accepting writes a
 * dated reset (`settings.loadResets`) that the next session opens on and
 * that stops applying the moment it has been lifted; until then the card
 * says what the next session will be and offers to undo it.
 *
 * A bodyweight movement stalls too but has no bar to lower, so it is
 * named without a button.
 */
export function StallCard({
  exerciseId,
  series,
  bodyweight,
}: {
  readonly exerciseId: string
  readonly series: ExerciseSeries
  readonly bodyweight: boolean
}) {
  const { clock } = useServices()
  const { settings, update } = useSettings()

  const tops = series.sessions.map((session) => session.top)
  const latest = series.sessions.at(-1)
  const key = resetKey(exerciseId, series.variant)
  const pending = settings.loadResets?.[key]
  const waiting = resetPending(pending, latest?.startedAt)

  if (waiting && pending !== undefined) {
    return (
      <Card className="border-accent-500/40 flex items-center justify-between gap-3">
        <p className="text-ink-100 text-sm">
          Next session opens at{' '}
          <span className="numeric font-semibold">{formatLoad(pending.load, settings.units)}</span>{' '}
          and climbs from there.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            update({
              loadResets: Object.fromEntries(
                Object.entries(settings.loadResets ?? {}).filter(([one]) => one !== key),
              ),
            })
          }}
        >
          <Undo2 size={14} aria-hidden />
          Undo
        </Button>
      </Card>
    )
  }

  if (!isStalled(tops) || latest === undefined) return null
  const stuck = sessionsWithoutProgress(tops)
  const load = latest.top.load ?? 0
  const target = bodyweight || load <= 0 ? undefined : resetLoad(load, settings.roundingIncrement)

  return (
    <Card className="border-warn-500/35">
      <p className="text-warn-500 flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] uppercase">
        <TrendingDown size={14} aria-hidden />
        Stalled
      </p>
      <p className="text-ink-100 mt-2 text-sm">
        {stuck} sessions without beating your best
        {load > 0 ? ` at ${formatLoad(load, settings.units)}` : ''}.{' '}
        <span className="text-ink-300">
          {target === undefined
            ? 'A few lighter sessions, or a different range, usually breaks it.'
            : 'Dropping the bar a little and climbing back usually breaks it.'}
        </span>
      </p>
      {target !== undefined && (
        <Button
          variant="outline"
          full
          className="mt-3"
          onClick={() => {
            update({
              loadResets: {
                ...(settings.loadResets ?? {}),
                [key]: { load: target, at: clock.now().toISOString() },
              },
            })
          }}
        >
          Reset to {formatLoad(target, settings.units)}
        </Button>
      )}
    </Card>
  )
}
