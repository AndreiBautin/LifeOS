import { Target } from 'lucide-react'

import { Card, CardHeading } from '@/components/shared/primitives'
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import { scheduledVolume } from '@/domain/programs/program'
import { displaySets } from '@/domain/volume/accounting'

import { useWeekSummary } from './hooks'
import { useNextSession } from './useNextSession'

/**
 * This week's accessory sets against the week's targets, as one shape.
 *
 * **It was ten full-width bars**, reported as _"plain, clunky, and takes
 * up most of the screen"_ — one row per muscle, the width of the page,
 * under its own section heading. A radar answers the same question in a
 * card: the dashed ring is the target, the filled shape is the week so
 * far, and a muscle that is behind shows as a dent. The numbers stay on
 * every spoke, because a shape alone cannot be checked.
 *
 * **Against this week's plan, deload included.** The targets come from
 * `scheduledVolume` over the week the lifter is actually in, so a light
 * week is judged against a light week's numbers.
 *
 * Muscles worked with no target are named underneath rather than drawn —
 * a spoke with no ring has nothing to be measured against.
 */
const SIZE = { width: 360, height: 300 }
const CENTER = { x: 180, y: 150 }
/** The target ring's radius; the shape may run past it to `OVERSHOOT`. */
const RING = 78
const OVERSHOOT = 1.25

export function WeekCard() {
  const summary = useWeekSummary()
  const { thisWeek } = useNextSession()

  const targets = thisWeek === undefined ? {} : scheduledVolume(thisWeek)
  const done = summary.data?.volume

  const spokes = (Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[])
    .filter((muscle) => (targets[muscle] ?? 0) > 0)
    .map((muscle) => ({
      muscle,
      target: targets[muscle] ?? 0,
      done: done?.[muscle] ?? 0,
    }))

  const untargeted = (Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).filter(
    (muscle) => (targets[muscle] ?? 0) === 0 && (done?.[muscle] ?? 0) > 0,
  )

  const totalTarget = spokes.reduce((sum, spoke) => sum + spoke.target, 0)
  const totalDone = spokes.reduce((sum, spoke) => sum + Math.min(spoke.done, spoke.target), 0)

  return (
    <Card>
      <CardHeading icon={<Target size={16} aria-hidden />} title="This week" />
      <p className="text-ink-300 text-sm">
        <span className="numeric text-ink-50 font-semibold">{displaySets(totalDone)}</span> of{' '}
        <span className="numeric">{totalTarget}</span> target sets
        <span className="text-ink-500">
          {' '}
          · {summary.data?.sessions ?? 0} session{summary.data?.sessions === 1 ? '' : 's'}
        </span>
      </p>

      {spokes.length >= 3 ? (
        <Radar spokes={spokes} />
      ) : (
        <p className="text-ink-500 mt-3 text-xs">
          The week&rsquo;s targets appear once it is planned.
        </p>
      )}

      {untargeted.length > 0 && done !== undefined && (
        <p className="text-ink-500 text-xs">
          Also worked:{' '}
          <span className="numeric text-ink-300">
            {untargeted
              .map(
                (muscle) =>
                  `${MUSCLE_GROUP_LABELS[muscle].toLowerCase()} ${displaySets(done[muscle])}`,
              )
              .join(' · ')}
          </span>
        </p>
      )}
    </Card>
  )
}

interface Spoke {
  readonly muscle: MuscleGroup
  readonly target: number
  readonly done: number
}

function Radar({ spokes }: { readonly spokes: readonly Spoke[] }) {
  const angleOf = (index: number) => (index / spokes.length) * Math.PI * 2 - Math.PI / 2
  const pointAt = (index: number, radius: number) => ({
    x: CENTER.x + Math.cos(angleOf(index)) * radius,
    y: CENTER.y + Math.sin(angleOf(index)) * radius,
  })
  const ring = (fraction: number) =>
    spokes
      .map((_, index) => {
        const p = pointAt(index, RING * fraction)
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
      })
      .join(' ')

  const reached = spokes.map((spoke, index) =>
    pointAt(index, RING * Math.min(spoke.done / spoke.target, OVERSHOOT)),
  )
  const empty = spokes.every((spoke) => spoke.done === 0)

  return (
    <svg
      viewBox={`0 0 ${String(SIZE.width)} ${String(SIZE.height)}`}
      className="my-1 w-full"
      role="img"
      aria-label={spokes
        .map(
          (spoke) =>
            `${MUSCLE_GROUP_LABELS[spoke.muscle]} ${displaySets(spoke.done)} of ${String(spoke.target)}`,
        )
        .join(', ')}
    >
      {/* The grid: half way, and the target itself, dashed and lit. */}
      <polygon points={ring(0.5)} fill="none" stroke="var(--color-ink-800)" />
      {spokes.map((_, index) => {
        const end = pointAt(index, RING * OVERSHOOT)
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
      <polygon
        points={ring(1)}
        fill="color-mix(in oklab, var(--color-accent-500) 5%, transparent)"
        stroke="color-mix(in oklab, var(--color-accent-400) 55%, transparent)"
        strokeDasharray="4 4"
      />

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
        reached.map((p, index) => {
          const spoke = spokes[index]
          const met = spoke !== undefined && spoke.done >= spoke.target
          return (
            <circle
              key={index}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill={met ? 'var(--color-good-500)' : 'var(--color-accent-400)'}
              stroke="var(--color-ink-950)"
              strokeWidth="1.5"
            />
          )
        })}

      {spokes.map((spoke, index) => {
        const p = pointAt(index, RING * OVERSHOOT + 18)
        const cos = Math.cos(angleOf(index))
        const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle'
        const met = spoke.done >= spoke.target
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
              fill={met ? 'var(--color-good-500)' : 'var(--color-ink-500)'}
            >
              {displaySets(spoke.done)}/{spoke.target}
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
