import type { Attribute, Level } from '@/domain/game/character'
import { LEVELS } from '@/domain/game/character'

/**
 * The three competition lifts, read as a shape rather than three rows.
 *
 * **The radar itself is not new — `TraitRadar` drew one in this exact
 * slot and was replaced**, on the grounds that XP-based traits barely
 * move week to week, so the polygon rarely changed shape. That objection
 * does not apply here: these three lifts are each anchored to a
 * published bodyweight-multiple standard (`STRENGTH_STANDARDS`) and RTS
 * is built to move the load behind them session over session, so the
 * triangle this draws is one of the few shapes in the app that actually
 * changes on a normal week.
 *
 * **The spoke is overall standing, not progress-within-level.**
 * `AttributeRow`'s bar deliberately resets to 0% at the start of every
 * new level — that is the right reading for "how close is the next
 * badge," and the wrong one for a radar: two lifts both reading "40%"
 * would plot identically whether one is 40% through Novice and the other
 * 40% through Elite, which erases the entire reason to compare three
 * lifts by shape. `overallFraction` folds the level index in
 * (`LEVELS.indexOf(level) + progress`, over the number of levels) so a
 * squat at Advanced sits visibly further out than a bench at Novice.
 *
 * **A lift with no recorded max plots at the centre, not off the
 * chart.** `buildCharacter` already returns `level: 'Untrained',
 * progress: 0` for one, which is exactly the centre under this formula —
 * the same absent-never-zero reasoning the rest of this app already
 * applies, arrived at for free rather than as a special case.
 */

const SIZE = 240
const CENTRE = SIZE / 2
const MAX_RADIUS = 82
const RINGS = [0.25, 0.5, 0.75, 1]

function overallFraction(attribute: Attribute): number {
  const index = LEVELS.indexOf(attribute.level)
  const atLevel = index < 0 ? 0 : index
  return Math.max(0, Math.min(1, (atLevel + attribute.progress) / LEVELS.length))
}

function pointAt(index: number, count: number, radius: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2
  return {
    x: CENTRE + radius * Math.cos(angle),
    y: CENTRE + radius * Math.sin(angle),
  }
}

function polygonPoints(fractions: readonly number[]): string {
  return fractions
    .map((fraction, index) => {
      const { x, y } = pointAt(index, fractions.length, MAX_RADIUS * fraction)
      return `${String(x)},${String(y)}`
    })
    .join(' ')
}

const LEVEL_LABEL: Record<Level, string> = {
  Untrained: 'Untrained',
  Novice: 'Novice',
  Intermediate: 'Intermediate',
  Advanced: 'Advanced',
  Elite: 'Elite',
}

export function LiftRadar({ lifts }: { readonly lifts: readonly Attribute[] }) {
  if (lifts.length < 3) return null

  const fractions = lifts.map(overallFraction)

  return (
    <svg
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className="mx-auto h-full max-h-[280px] w-full max-w-[280px]"
      role="img"
      aria-label={`Lift shape: ${lifts.map((lift) => `${lift.name} ${LEVEL_LABEL[lift.level]}`).join(', ')}`}
    >
      {/* Reference rings, plain and quiet so the one filled shape that is
          data stays the only thing that reads as "look here". */}
      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={polygonPoints(lifts.map(() => ring))}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={1}
        />
      ))}

      {/* One spoke per lift, from the centre out to the outer ring. */}
      {lifts.map((lift, index) => {
        const { x, y } = pointAt(index, lifts.length, MAX_RADIUS)
        return (
          <line
            key={lift.name}
            x1={CENTRE}
            y1={CENTRE}
            x2={x}
            y2={y}
            stroke="var(--border-subtle)"
            strokeWidth={1}
          />
        )
      })}

      {/* The one filled shape, and the only thing here that is a
          reading rather than a grid. */}
      <polygon
        points={polygonPoints(fractions)}
        fill="color-mix(in oklab, var(--color-accent-500) 22%, transparent)"
        stroke="var(--color-accent-400)"
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 6px var(--color-accent-500))' }}
      />

      {lifts.map((lift, index) => {
        if (lift.value === undefined) return null
        const { x, y } = pointAt(index, lifts.length, MAX_RADIUS * overallFraction(lift))
        return (
          <circle key={`${lift.name}-point`} cx={x} cy={y} r={3} fill="var(--color-accent-400)" />
        )
      })}

      {/* Labels, outside the outer ring so they never sit over the fill. */}
      {lifts.map((lift, index) => {
        const { x, y } = pointAt(index, lifts.length, MAX_RADIUS + 26)
        return (
          <text
            key={`${lift.name}-label`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={lift.value !== undefined ? 'var(--text-secondary)' : 'var(--text-muted)'}
            fontSize={11}
            fontWeight={500}
          >
            {lift.name}
          </text>
        )
      })}
    </svg>
  )
}
