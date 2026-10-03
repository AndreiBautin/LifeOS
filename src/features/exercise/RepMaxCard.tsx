import { Gauge } from 'lucide-react'

import { useSettings } from '@/app/context'
import type { ExerciseSeries } from '@/domain/logging/exercise-history'
import { repMaxTable } from '@/domain/strength/rep-max'
import { formatLoad } from '@/domain/units/weight'
import { Card, CardHeading } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

/**
 * The estimate turned into loads for one to twelve reps, with the
 * heaviest bar actually done for each (`repMaxTable`).
 *
 * **Drawn as paired bars on one scale**: a ghost for what the estimate
 * predicts, a solid bar for what was done, gold where the done bar
 * reaches the prediction. Rows where the solid bar falls short are the
 * rep ranges the lifter is weaker in than their max suggests — something
 * a table of numbers makes you compute, and a pair of bars shows.
 */
export function RepMaxCard({
  series,
  estimate,
}: {
  readonly series: ExerciseSeries
  readonly estimate: number
}) {
  const { settings } = useSettings()
  const sets = series.sessions.flatMap((session) => session.sets)
  const rows = repMaxTable(estimate, sets, settings.e1rmFormula, settings.roundingIncrement)
  const scale = Math.max(estimate, ...rows.map((row) => row.actual ?? 0))

  return (
    <Card>
      <CardHeading icon={<Gauge size={16} aria-hidden />} title="Rep maxes" />
      <ul className="space-y-2.5">
        {rows.map((row) => {
          const reached = row.actual !== undefined && row.actual >= row.predicted
          return (
            <li key={row.reps} className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-3">
              <span className="text-ink-300 numeric text-xs">
                {row.reps} {row.reps === 1 ? 'rep' : 'reps'}
              </span>
              <span className="relative h-3" aria-hidden>
                <span
                  className="border-ink-500/60 absolute inset-y-0 left-0 rounded-full border border-dashed"
                  style={{ width: `${String((row.predicted / scale) * 100)}%` }}
                />
                {row.actual !== undefined && (
                  <span
                    className={cn(
                      'absolute inset-y-[3px] left-0 rounded-full',
                      reached ? 'bg-[oklch(0.86_0.13_85)]' : 'bg-accent-500',
                    )}
                    style={{ width: `${String((row.actual / scale) * 100)}%` }}
                  />
                )}
              </span>
              <span className="numeric text-right text-xs whitespace-nowrap">
                <span className="text-ink-50 font-semibold">
                  {formatLoad(row.predicted, settings.units)}
                </span>
                <span className="text-ink-500">
                  {row.actual === undefined
                    ? ' · not tried'
                    : ` · done ${formatLoad(row.actual, settings.units)}`}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-ink-500 mt-3 text-[0.7rem]">
        Dashed: what the estimate predicts. Solid: the heaviest done for that many reps, gold where
        it reaches the prediction.
      </p>
    </Card>
  )
}
