import { Clock3 } from 'lucide-react'

import type { WorkoutLog } from '@/domain/logging/workout-log'
import { sessionTimeline } from '@/domain/logging/timeline'
import { Card, CardHeading } from '@/components/shared/primitives'

/**
 * Where the session's time went, as one strip from start to finish.
 *
 * Each exercise is a band from its first set to its last, with a dot per
 * set; the gaps between bands are changing station, and the space before
 * the first and after the last is getting going and packing up. It is
 * the one picture of a session that answers "why did that take ninety
 * minutes" — a twenty-minute row band says it without a number — and it
 * costs nothing to keep, because every logged set is already stamped.
 */
const COLOURS = [
  'var(--color-accent-400)',
  'var(--color-cool-500)',
  'var(--color-warn-500)',
  'var(--color-good-500)',
] as const

export function SessionTimeline({
  workout,
  nameOf,
}: {
  readonly workout: WorkoutLog
  readonly nameOf: (id: string) => string
}) {
  const timeline = sessionTimeline(workout)
  if (timeline === undefined) return null

  const W = 600
  const H = 64
  const x = (ms: number) => 12 + (ms / Math.max(1, timeline.length)) * (W - 24)
  let colour = 0
  const bands = timeline.bands.map((band) => ({
    ...band,
    colour: band.warmup ? 'var(--color-ink-500)' : (COLOURS[colour++ % COLOURS.length] ?? ''),
  }))
  const minutes = Math.round(timeline.length / 60_000)

  return (
    <Card>
      <CardHeading icon={<Clock3 size={16} aria-hidden />} title="Where the time went" />
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${String(minutes)} minutes: ${bands
          .filter((band) => !band.warmup)
          .map((band) => `${nameOf(band.exerciseId)} ${duration(band.to - band.from)}`)
          .join(', ')}`}
      >
        <line x1={6} x2={W - 6} y1={38} y2={38} stroke="var(--color-ink-800)" strokeWidth={2} />
        {bands.map((band, index) => (
          <g key={`${band.exerciseId}-${String(index)}`}>
            <rect
              x={x(band.from) - 10}
              y={28}
              width={Math.max(20, x(band.to) - x(band.from) + 20)}
              height={20}
              rx={10}
              fill={band.colour}
              opacity={band.warmup ? 0.35 : 0.3}
            />
            {band.sets.map((at, set) => (
              <circle key={set} cx={x(at)} cy={38} r={5} fill={band.colour} />
            ))}
          </g>
        ))}
        <text x={6} y={16} fontSize={16} fill="var(--color-ink-500)">
          0
        </text>
        <text x={W - 6} y={16} fontSize={16} textAnchor="end" fill="var(--color-ink-500)">
          {minutes} min
        </text>
      </svg>

      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {bands
          .filter((band) => !band.warmup)
          .map((band, index) => (
            <li
              key={`${band.exerciseId}-${String(index)}`}
              className="flex min-w-0 items-center gap-2 text-xs"
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: band.colour }} />
              <span className="text-ink-300 truncate">{nameOf(band.exerciseId)}</span>
              <span className="text-ink-500 numeric ml-auto shrink-0">
                {duration(band.to - band.from)}
              </span>
            </li>
          ))}
      </ul>

      {timeline.medianRest !== undefined && (
        <p className="text-ink-500 numeric mt-3 text-xs">
          Rest between sets: about {clock(timeline.medianRest)}, longest{' '}
          {clock(timeline.longestRest ?? timeline.medianRest)}
        </p>
      )}
    </Card>
  )
}

function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  return minutes < 1 ? '<1 min' : `${String(minutes)} min`
}

function clock(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}
