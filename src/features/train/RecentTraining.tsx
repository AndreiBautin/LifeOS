import { Link } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'

import { useSettings } from '@/app/context'
import { Card, CardHeading } from '@/components/shared/primitives'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { workingSets } from '@/domain/logging/workout-log'
import { formatLoad } from '@/domain/units/weight'

import { useRecentWorkouts } from './hooks'

/**
 * The last few sessions, as a trend line rather than a bar chart.
 *
 * **A real content card, not a `lg`-only decoration** — the other three
 * (`MainLifts`, `CampaignPath`, `ChallengeRing`) are second readings of
 * data already on screen, gated to wide windows because the bars and
 * text beside them already say the same thing. This says something
 * nothing else on Today does: how the last few sessions compare. It
 * earns a permanent place on every width, the same footing
 * `ActiveQuests` and `ChallengePass` already stand on.
 *
 * **The heaviest working set that session, not a count of sets.**
 * Reported plainly, *"just having sets logged in training history isn't
 * that useful cause I just see a bar chart with 10 everyday — my daily
 * volume stays pretty consistent anyway."* True by design — the
 * assembler targets a fixed set count per muscle per session, so a
 * chart of set counts was always going to be flat. Load is not fixed
 * the same way: RTS autoregulates it set by set specifically so it
 * climbs as the lifter progresses.
 *
 * **A line, not bars, and scaled from the data's own range rather than
 * from zero.** Reported again once the metric was already varying:
 * *"still didn't see much variation."* Bars scaled from zero compress a
 * 185–315 lb range into 59%–100% of a fixed height — real movement,
 * read as barely any. A trend line scaled between the *lowest* and
 * *highest* session shown stretches that same range across the full
 * height, which is the ordinary convention every stock chart uses for
 * exactly this reason: the number that matters is the change, not the
 * distance from an arbitrary zero nobody was ever going to lift.
 *
 * **Silent under two sessions.** One point cannot show a trend, and a
 * chart claiming to compare sessions with only one to show would be
 * reporting a fact about the fixture rather than about training.
 */

const WIDTH = 300
const HEIGHT = 72
const PAD_X = 10
const PAD_Y = 16

function label(log: WorkoutLog): string {
  const on = new Date(log.date)
  return on.toLocaleDateString('en-US', { weekday: 'short' })
}

/** The heaviest completed, non-warm-up load logged anywhere in the session. */
function topLoad(log: WorkoutLog): number {
  return log.entries.reduce((sessionMax, entry) => {
    const entryMax = workingSets(entry).reduce(
      (setMax, set) => Math.max(setMax, set.actualLoad ?? 0),
      0,
    )
    return Math.max(sessionMax, entryMax)
  }, 0)
}

function xAt(index: number, count: number): number {
  if (count <= 1) return WIDTH / 2
  return PAD_X + (index / (count - 1)) * (WIDTH - PAD_X * 2)
}

/** Higher load draws higher on screen, which is the opposite of SVG's y axis. */
function yAt(load: number, min: number, max: number): number {
  const span = max - min
  if (span <= 0) return HEIGHT / 2
  return PAD_Y + (1 - (load - min) / span) * (HEIGHT - PAD_Y * 2)
}

export function RecentTraining() {
  const recent = useRecentWorkouts(6)
  const { settings } = useSettings()
  const data = recent.data

  if (data === undefined) return null

  /*
   * Oldest to newest, left to right — a trend line reads as a timeline
   * only when time runs the way text does. `recent()` returns newest
   * first, which is right for a list and backwards for this.
   */
  const sessions = [...data].filter((log) => log.status !== 'in-progress').reverse()
  if (sessions.length < 2) return null

  const loads = sessions.map(topLoad)
  const min = Math.min(...loads)
  const max = Math.max(...loads)

  const points = sessions.map((_, index) => ({
    x: xAt(index, sessions.length),
    y: yAt(loads[index] ?? 0, min, max),
  }))

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${String(p.x)} ${String(p.y)}`)
    .join(' ')
  const areaPath = `${linePath} L ${String(points[points.length - 1]?.x ?? 0)} ${String(HEIGHT)} L ${String(points[0]?.x ?? 0)} ${String(HEIGHT)} Z`

  return (
    <Card>
      <CardHeading
        icon={<TrendingUp size={16} aria-hidden />}
        title="Recent training"
        action={
          <Link to="/history" className="text-ink-500 hover:text-ink-300 shrink-0 text-xs">
            History →
          </Link>
        }
      />
      <p className="text-ink-700 -mt-1 text-xs">Heaviest working set, oldest to newest</p>

      <svg
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="mt-3 h-20 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Heaviest working set across ${String(sessions.length)} recent sessions, ${formatLoad(loads[0] ?? 0, settings.units)} to ${formatLoad(loads[loads.length - 1] ?? 0, settings.units)}`}
      >
        <defs>
          <linearGradient id="training-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#training-trend-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-accent-500)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {sessions.map((log, index) => {
          const point = points[index]
          if (point === undefined) return null
          const abandoned = log.status === 'abandoned'
          const isLast = index === sessions.length - 1
          const load = loads[index] ?? 0
          /* Above the dot, unless the dot sits in the top band — then
             below it, so the number never collides with the line. */
          const labelY = point.y < PAD_Y + 10 ? point.y + 14 : point.y - 8

          return (
            <g key={log.id}>
              <title>{`${log.title} — ${formatLoad(load, settings.units)}`}</title>
              <circle
                cx={point.x}
                cy={point.y}
                r={isLast ? 4 : 2.5}
                fill={abandoned ? 'var(--color-ink-700)' : 'var(--color-accent-500)'}
                style={isLast ? { filter: 'drop-shadow(0 0 3px var(--color-accent-500))' } : {}}
              />
              <text
                x={point.x}
                y={labelY}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-secondary)"
                className="numeric"
              >
                {Math.round(load)}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="mt-1 flex justify-between gap-2">
        {sessions.map((log) => (
          <span key={log.id} className="text-ink-700 flex-1 text-center text-[10px]">
            {label(log)}
          </span>
        ))}
      </div>
    </Card>
  )
}
