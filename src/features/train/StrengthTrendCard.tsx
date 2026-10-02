import { TrendingUp } from 'lucide-react'
import { useId, useState, type PointerEvent } from 'react'

import { useSettings } from '@/app/context'
import { Card, CardHeading } from '@/components/shared/primitives'
import { strengthTrend, type TrendLift, type TrendPoint } from '@/domain/strength/trend'
import { parseDay } from '@/domain/time/day'

import { useRecentWorkouts } from './hooks'

/**
 * Each lift's estimated max over the months, as three lines.
 *
 * **Scaled to the data, not anchored at zero** — the rule this app already
 * holds for trend charts over bar series: from zero, three lifts climbing
 * forty pounds each are three flat lines near the top of the box, and the
 * climb is the whole thing worth seeing. One shared scale rather than one
 * per line, so the gap between the bench and the deadlift is a real gap.
 *
 * Silent until some lift has two points: a single dot is not a trend.
 */
const LIFTS: readonly {
  readonly lift: TrendLift
  readonly label: string
  readonly colour: string
}[] = [
  { lift: 'squat', label: 'Squat', colour: 'var(--color-accent-400)' },
  { lift: 'bench', label: 'Bench', colour: 'var(--color-cool-500)' },
  { lift: 'deadlift', label: 'Deadlift', colour: 'var(--color-warn-500)' },
]

const WIDTH = 600
const HEIGHT = 190
const PAD = { top: 12, right: 14, bottom: 22, left: 40 }

/** Enough sessions to cover the months the history screen shows. */
const WINDOW = 200

export function StrengthTrendCard() {
  const workouts = useRecentWorkouts(WINDOW)
  const { settings } = useSettings()
  const gradientBase = useId()
  /*
   * **The chart can be scrubbed.** Hover, or drag a finger across it, and
   * a crosshair snaps to the nearest session while the three figures above
   * read that day rather than today — the question a trend chart invites
   * ("what was I benching in August?") answered where it is asked.
   * `touch-action: pan-y` keeps a vertical swipe scrolling the page.
   */
  const [at, setAt] = useState<string | undefined>(undefined)

  if (workouts.data === undefined) return null

  const trend = strengthTrend(workouts.data)
  const drawn = LIFTS.filter(({ lift }) => trend[lift].length >= 2)
  if (drawn.length === 0) return null

  const all = drawn.flatMap(({ lift }) => trend[lift])
  const times = all.map((point) => parseDay(point.date).getTime())
  const firstTime = Math.min(...times)
  const lastTime = Math.max(...times)
  const values = all.map((point) => point.value)
  // A little air above and below, rounded to a figure worth labelling.
  const low = Math.floor((Math.min(...values) - 15) / 25) * 25
  const high = Math.ceil((Math.max(...values) + 15) / 25) * 25

  const x = (date: string): number =>
    PAD.left +
    ((parseDay(date).getTime() - firstTime) / Math.max(1, lastTime - firstTime)) *
      (WIDTH - PAD.left - PAD.right)
  const y = (value: number): number =>
    PAD.top + (1 - (value - low) / Math.max(1, high - low)) * (HEIGHT - PAD.top - PAD.bottom)

  const path = (points: readonly TrendPoint[]): string =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'}${x(point.date).toFixed(1)},${y(point.value).toFixed(1)}`,
      )
      .join(' ')

  const gridValues = [low, (low + high) / 2, high]
  const month = (date: string): string =>
    parseDay(date).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const dates = [...new Set(all.map((point) => point.date))].sort()
  const valueAt = (points: readonly TrendPoint[], date: string): number | undefined =>
    points.filter((point) => point.date <= date).at(-1)?.value

  const scrub = (event: PointerEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    const viewX = ((event.clientX - box.left) / box.width) * WIDTH
    const nearest = dates.reduce((best, date) =>
      Math.abs(x(date) - viewX) < Math.abs(x(best) - viewX) ? date : best,
    )
    setAt(nearest)
  }
  const day = (date: string): string =>
    parseDay(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

  const firstDate = all.reduce((a, b) => (a.date < b.date ? a : b)).date
  const lastDate = all.reduce((a, b) => (a.date > b.date ? a : b)).date

  return (
    <Card>
      <CardHeading icon={<TrendingUp size={14} aria-hidden />} title="Strength over time" />

      <div className="mb-3 grid grid-cols-3 gap-2">
        {drawn.map(({ lift, label, colour }) => {
          const points = trend[lift]
          const first = points[0]?.value ?? 0
          const scrubbed = at === undefined ? undefined : valueAt(points, at)
          const last = at === undefined ? (points.at(-1)?.value ?? 0) : scrubbed
          const gain = (last ?? first) - first
          return (
            <div key={lift} className="min-w-0">
              <p className="text-ink-500 flex items-center gap-1.5 text-xs">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colour }}
                />
                {label}
              </p>
              <p className="text-ink-50 numeric text-lg font-semibold">
                {last ?? '—'}
                <span className="text-ink-500 ml-1 text-xs font-normal">{settings.units}</span>
              </p>
              {at !== undefined ? (
                <p className="text-ink-500 numeric text-xs">{day(at)}</p>
              ) : (
                gain !== 0 && (
                  <p
                    className={
                      gain > 0 ? 'text-good-500 numeric text-xs' : 'text-bad-500 numeric text-xs'
                    }
                  >
                    {gain > 0 ? '+' : '−'}
                    {Math.abs(gain)} since {month(points[0]?.date ?? firstDate)}
                  </p>
                )
              )}
            </div>
          )
        })}
      </div>

      <svg
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="h-auto w-full cursor-crosshair touch-pan-y select-none"
        onPointerMove={scrub}
        onPointerDown={scrub}
        onPointerLeave={() => {
          setAt(undefined)
        }}
        onPointerCancel={() => {
          setAt(undefined)
        }}
        role="img"
        aria-label={`Estimated maxes from ${month(firstDate)} to ${month(lastDate)}: ${drawn
          .map(({ lift, label }) => `${label} ${String(trend[lift].at(-1)?.value ?? 0)}`)
          .join(', ')}`}
      >
        <defs>
          {drawn.map(({ lift, colour }) => (
            <linearGradient key={lift} id={`${gradientBase}-${lift}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity="0.16" />
              <stop offset="100%" stopColor={colour} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--color-ink-800)"
              strokeDasharray="2 4"
            />
            <text
              x={PAD.left - 8}
              y={y(value)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--color-ink-600)"
              fontSize={10}
            >
              {Math.round(value)}
            </text>
          </g>
        ))}

        <text x={PAD.left} y={HEIGHT - 4} fill="var(--color-ink-600)" fontSize={10}>
          {month(firstDate)}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 4}
          textAnchor="end"
          fill="var(--color-ink-600)"
          fontSize={10}
        >
          {month(lastDate)}
        </text>

        {drawn.map(({ lift, colour }, index) => {
          const points = trend[lift]
          const line = path(points)
          const lastPoint = points.at(-1)
          const firstPoint = points[0]
          const baseline = HEIGHT - PAD.bottom
          return (
            <g
              key={lift}
              style={{ '--line-delay': `${String(index * 180)}ms` } as React.CSSProperties}
            >
              {firstPoint !== undefined && lastPoint !== undefined && (
                <path
                  className="area-fade"
                  d={`${line} L${x(lastPoint.date).toFixed(1)},${String(baseline)} L${x(firstPoint.date).toFixed(1)},${String(baseline)} Z`}
                  fill={`url(#${gradientBase}-${lift})`}
                />
              )}
              <path
                className="line-draw"
                d={line}
                pathLength={1}
                fill="none"
                stroke={colour}
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {lastPoint !== undefined && (
                <circle
                  className="line-end"
                  cx={x(lastPoint.date)}
                  cy={y(lastPoint.value)}
                  r={4}
                  fill={colour}
                  style={{ filter: `drop-shadow(0 0 5px ${colour})` }}
                />
              )}
            </g>
          )
        })}

        {at !== undefined && (
          <g pointerEvents="none">
            <line
              x1={x(at)}
              x2={x(at)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              stroke="var(--color-ink-300)"
              strokeOpacity={0.5}
              strokeDasharray="3 3"
            />
            {drawn.map(({ lift, colour }) => {
              const value = valueAt(trend[lift], at)
              return value === undefined ? null : (
                <circle
                  key={lift}
                  cx={x(at)}
                  cy={y(value)}
                  r={5}
                  fill="var(--color-ink-950)"
                  stroke={colour}
                  strokeWidth={2.5}
                />
              )
            })}
          </g>
        )}
      </svg>
    </Card>
  )
}
