import type { TraitStanding } from '@/domain/game/traits'

/**
 * The traits, read as a shape rather than a stack of bars.
 *
 * **Today's `SheetCard` only, at `2xl`** — the same gating `AvatarPortrait`
 * uses for `size="large"`. The linear bars in `Traits.tsx` stay exactly as
 * they are everywhere, including here: this is an additional reading, not
 * a replacement, because a radar answers "what shape is my week" at a
 * glance while a bar answers "how far into level 6" precisely. Losing the
 * second to gain the first would be a worse trade than having both.
 *
 * **An unproven trait plots at the centre, not at a guessed value.** The
 * same absent-never-zero rule the bars already follow: a spoke drawn at
 * zero is a genuine reading of "nothing yet", where dropping the axis
 * entirely would make the polygon's shape depend on which traits happen
 * to be proven, and two people with different traits proven could never
 * compare shapes at a glance.
 */

const SIZE = 240
const CENTRE = SIZE / 2
const MAX_RADIUS = 82
const RINGS = [0.25, 0.5, 0.75, 1]

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

export function TraitRadar({ traits }: { readonly traits: readonly TraitStanding[] }) {
  if (traits.length < 3) return null

  const fractions = traits.map((standing) =>
    standing.proven ? Math.max(0, Math.min(1, standing.into / standing.needed)) : 0,
  )

  return (
    <svg
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className="mx-auto h-full max-h-[280px] w-full max-w-[280px]"
      role="img"
      aria-label={`Trait shape: ${traits.map((standing) => `${standing.trait.label} level ${String(standing.level)}`).join(', ')}`}
    >
      {/* The rings are reference, not data — plain and quiet so the one
          filled shape that is data stays the only thing that reads as
          "look here". */}
      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={polygonPoints(traits.map(() => ring))}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={1}
        />
      ))}

      {/* One spoke per trait, from the centre out to the outer ring. */}
      {traits.map((standing, index) => {
        const { x, y } = pointAt(index, traits.length, MAX_RADIUS)
        return (
          <line
            key={standing.trait.id}
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

      {traits.map((standing, index) => {
        const { x, y } = pointAt(index, traits.length, MAX_RADIUS)
        const proven = standing.proven
        return (
          proven && (
            <circle
              key={`${standing.trait.id}-point`}
              cx={x}
              cy={y}
              r={3}
              fill="var(--color-accent-400)"
            />
          )
        )
      })}

      {/* Labels, outside the outer ring so they never sit over the fill. */}
      {traits.map((standing, index) => {
        const { x, y } = pointAt(index, traits.length, MAX_RADIUS + 22)
        return (
          <text
            key={`${standing.trait.id}-label`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={standing.proven ? 'var(--text-secondary)' : 'var(--text-tertiary)'}
            fontSize={11}
            fontWeight={500}
          >
            {standing.trait.label}
          </text>
        )
      })}
    </svg>
  )
}
