import { Target } from 'lucide-react'

import { Card, CardHeading } from '@/components/shared/primitives'
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import { scheduledVolume } from '@/domain/programs/program'
import { displaySets } from '@/domain/volume/accounting'

import { useWeekSummary } from './hooks'
import { useNextSession } from './useNextSession'

/**
 * This week's sets by muscle, as one shape.
 *
 * **It plots what was done, on a fixed scale, against nothing.** It used
 * to draw a dashed "scheduled" ring from each day's `volumeTargets` and
 * label every spoke "done/scheduled". Asked: _"this still seems tied to
 * the target volumes"_ — it was, and the two halves did not even count
 * the same work: the ring was accessory sets only while the shape counted
 * every working set, so a bench week read "chest 10/5". With four sets on
 * every exercise a per-muscle target says nothing the routine does not.
 *
 * The rings are every five sets, labelled, out to the busiest muscle's
 * count rounded up (ten at least) — a scale with its numbers on it, so a
 * small week reads as a small shape without the card claiming any number
 * was owed.
 * The spokes are the muscles the routine trains — the one thing still
 * read from the week, and only for which muscles, never how many sets.
 * The per-muscle "also worked" list went with the targets.
 */
const SIZE = { width: 360, height: 300 }
const CENTER = { x: 180, y: 150 }
const RADIUS = 92
const STEP = 5
const MIN_SCALE = 10

export function WeekCard() {
  const summary = useWeekSummary()
  const { thisWeek } = useNextSession()

  const trained = thisWeek === undefined ? {} : scheduledVolume(thisWeek)
  const done = summary.data?.volume

  const spokes = (Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[])
    .filter((muscle) => (trained[muscle] ?? 0) > 0)
    .map((muscle) => ({ muscle, done: done?.[muscle] ?? 0 }))

  const sets = summary.data?.sets ?? 0
  const sessions = summary.data?.sessions ?? 0

  return (
    <Card>
      <CardHeading icon={<Target size={16} aria-hidden />} title="This week" />
      <p className="text-ink-300 text-sm">
        <span className="numeric text-ink-50 font-semibold">{sets}</span> working sets
        <span className="text-ink-500">
          {' '}
          · {sessions} session{sessions === 1 ? '' : 's'}
        </span>
      </p>

      {spokes.length >= 3 ? (
        <Radar spokes={spokes} />
      ) : (
        <p className="text-ink-500 mt-3 text-xs">
          The week&rsquo;s shape appears once it is planned.
        </p>
      )}
    </Card>
  )
}

interface Spoke {
  readonly muscle: MuscleGroup
  readonly done: number
}

function Radar({ spokes }: { readonly spokes: readonly Spoke[] }) {
  const most = Math.max(...spokes.map((spoke) => spoke.done))
  const scale = Math.max(MIN_SCALE, Math.ceil(most / STEP) * STEP)
  const rings = Array.from({ length: scale / STEP }, (_, index) => (index + 1) * STEP)
  const angleOf = (index: number) => (index / spokes.length) * Math.PI * 2 - Math.PI / 2
  const pointAt = (index: number, radius: number) => ({
    x: CENTER.x + Math.cos(angleOf(index)) * radius,
    y: CENTER.y + Math.sin(angleOf(index)) * radius,
  })
  const ring = (sets: number) =>
    spokes
      .map((_, index) => {
        const p = pointAt(index, (RADIUS * sets) / scale)
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
      })
      .join(' ')

  const reached = spokes.map((spoke, index) => pointAt(index, (RADIUS * spoke.done) / scale))
  const empty = spokes.every((spoke) => spoke.done === 0)

  return (
    <svg
      viewBox={`0 0 ${String(SIZE.width)} ${String(SIZE.height)}`}
      className="my-1 w-full"
      role="img"
      aria-label={spokes
        .map((spoke) => `${MUSCLE_GROUP_LABELS[spoke.muscle]} ${displaySets(spoke.done)} sets`)
        .join(', ')}
    >
      {rings.map((sets) => (
        <polygon key={sets} points={ring(sets)} fill="none" stroke="var(--color-ink-800)" />
      ))}
      {rings.map((sets) => (
        <text
          key={sets}
          x={CENTER.x + 3}
          y={CENTER.y - (RADIUS * sets) / scale - 2}
          fontSize="8"
          fill="var(--color-ink-700)"
          className="numeric"
        >
          {sets}
        </text>
      ))}
      {spokes.map((_, index) => {
        const end = pointAt(index, RADIUS)
        return (
          <line
            key={index}
            x1={CENTER.x}
            y1={CENTER.y}
            x2={end.x}
            y2={end.y}
            stroke="var(--color-ink-800)"
          />
        )
      })}

      {!empty && (
        <polygon
          className="area-fade"
          style={{ ['--line-delay' as string]: '-700ms' }}
          points={reached.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
          fill="color-mix(in oklab, var(--color-accent-500) 30%, transparent)"
          stroke="var(--color-accent-400)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      {!empty &&
        reached.map((p, index) => (
          <circle
            key={index}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill="var(--color-accent-400)"
            stroke="var(--color-ink-950)"
            strokeWidth="1.5"
          />
        ))}

      {spokes.map((spoke, index) => {
        const p = pointAt(index, RADIUS + 18)
        const cos = Math.cos(angleOf(index))
        const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'
        return (
          <text key={spoke.muscle} x={p.x} y={p.y} textAnchor={anchor} fontSize="11">
            <tspan x={p.x} dy="-0.15em" fill="var(--color-ink-300)">
              {MUSCLE_GROUP_LABELS[spoke.muscle]}
            </tspan>
            <tspan
              x={p.x}
              dy="1.25em"
              className="numeric"
              fontWeight="600"
              fill={spoke.done > 0 ? 'var(--color-ink-50)' : 'var(--color-ink-700)'}
            >
              {displaySets(spoke.done)}
            </tspan>
          </text>
        )
      })}

      {empty && (
        <text
          x={CENTER.x}
          y={CENTER.y + 4}
          textAnchor="middle"
          fontSize="12"
          fill="var(--color-ink-500)"
        >
          No sets yet this week
        </text>
      )}
    </svg>
  )
}
