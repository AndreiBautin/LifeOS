import { Scale } from 'lucide-react'
import { useState } from 'react'

import { useServices } from '@/app/context'
import { Button, Card, CardHeading } from '@/components/shared/primitives'
import { currentTrend } from '@/domain/vitals/weight'
import type { WeighIn } from '@/domain/vitals/weight'
import { cn } from '@/lib/cn'

import { useRecordWeighIn, useWeighInHistory } from './hooks'

/**
 * Bodyweight, as a trend line — replacing `RecentTraining` in this slot.
 *
 * **Reintroduced after being deliberately removed**, asked for directly
 * and knowing the cost: this app's own history records weight tracking
 * being scrapped because a scale and a phone already keep this number
 * between them, and there is no way for a web app to read HealthKit at
 * all. Neither of those problems is solved by this file — it is one
 * number, entered by hand, same as the original version before the
 * phase-and-rate machinery was layered on top of it. See
 * `domain/vitals/weight.ts` for the rest of that reasoning.
 *
 * **The chart is `RecentTraining`'s own recipe, not a new one.** A line
 * scaled between the data's own lowest and highest point, not from zero
 * — bodyweight moves in a narrow band, and a chart scaled from zero
 * would flatten a real four-pound swing into a barely-visible wiggle,
 * the exact complaint that made `RecentTraining` a line chart in the
 * first place.
 *
 * **The log control is a plain number field, not a stepper.** Nothing
 * else in the app can supply this number — there is no sensor, no
 * import, no sync source — so it has to be typed, and a field that
 * remembers the last value typed is friendlier than one that always
 * opens empty.
 */

const WIDTH = 300
const HEIGHT = 72
const PAD_X = 10
const PAD_Y = 16

function label(weighIn: WeighIn): string {
  const on = new Date(`${weighIn.day}T00:00:00`)
  return on.toLocaleDateString('en-US', { weekday: 'short' })
}

function xAt(index: number, count: number): number {
  if (count <= 1) return WIDTH / 2
  return PAD_X + (index / (count - 1)) * (WIDTH - PAD_X * 2)
}

function yAt(value: number, min: number, max: number): number {
  const span = max - min
  if (span <= 0) return HEIGHT / 2
  return PAD_Y + (1 - (value - min) / span) * (HEIGHT - PAD_Y * 2)
}

export function WeightTrend({ className }: { readonly className?: string }) {
  const history = useWeighInHistory()
  const record = useRecordWeighIn()
  const now = useServices().clock.now()
  const [input, setInput] = useState('')

  const rows = history.data
  if (rows === undefined) return null

  const recent = rows.slice(-14)

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeading icon={<Scale size={16} aria-hidden />} title="Weight" />

      <div className="flex-1">
        {recent.length < 2 ? (
          <p className="text-ink-500 text-sm">Log a weigh-in to start the trend.</p>
        ) : (
          <>
            {(() => {
              const values = recent.map((row) => row.weight)
              const min = Math.min(...values)
              const max = Math.max(...values)

              const points = recent.map((row, index) => ({
                x: xAt(index, recent.length),
                y: yAt(row.weight, min, max),
              }))

              const linePath = points
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${String(p.x)} ${String(p.y)}`)
                .join(' ')
              const areaPath = `${linePath} L ${String(points[points.length - 1]?.x ?? 0)} ${String(HEIGHT)} L ${String(points[0]?.x ?? 0)} ${String(HEIGHT)} Z`

              return (
                <svg
                  viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
                  className="mt-3 h-24 w-full lg:h-40"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`Weight across ${String(recent.length)} recent readings, ${String(values[0])} to ${String(values[values.length - 1])}`}
                >
                  <defs>
                    <linearGradient id="weight-trend-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-cool-500)" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="var(--color-cool-500)" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  <path d={areaPath} fill="url(#weight-trend-fill)" />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="var(--color-cool-500)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />

                  {recent.map((row, index) => {
                    const point = points[index]
                    if (point === undefined) return null
                    const isLast = index === recent.length - 1
                    const labelY = point.y < PAD_Y + 10 ? point.y + 14 : point.y - 8

                    return (
                      <g key={row.day}>
                        <title>{`${row.day} — ${String(row.weight)}`}</title>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={isLast ? 4 : 2.5}
                          fill="var(--color-cool-500)"
                          style={
                            isLast ? { filter: 'drop-shadow(0 0 3px var(--color-cool-500))' } : {}
                          }
                        />
                        <text
                          x={point.x}
                          y={labelY}
                          textAnchor="middle"
                          fontSize={9}
                          fill="var(--text-secondary)"
                          className="numeric"
                        >
                          {Math.round(row.weight * 10) / 10}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              )
            })()}

            <div className="mt-1 flex justify-between gap-2">
              {recent.map((row) => (
                <span key={row.day} className="text-ink-700 flex-1 text-center text-[10px]">
                  {label(row)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {(() => {
        const trend = currentTrend(rows, now)
        if (trend === undefined) return null
        return (
          <p className="text-ink-500 numeric mt-2 text-xs">
            {trend.value.toFixed(1)} avg · {trend.readings} reading{trend.readings === 1 ? '' : 's'}{' '}
            this week
          </p>
        )
      })()}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const value = Number(input)
          if (!Number.isFinite(value) || value <= 0) return
          record.mutate(value, {
            onSuccess: () => {
              setInput('')
            },
          })
        }}
      >
        <input
          inputMode="decimal"
          value={input}
          placeholder="Today's weight"
          aria-label="Today's weight"
          onChange={(event) => {
            setInput(event.target.value)
          }}
          className="bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-10 w-full rounded-lg border px-3 text-sm"
        />
        <Button type="submit" size="sm" disabled={record.isPending}>
          Log
        </Button>
      </form>
    </Card>
  )
}
