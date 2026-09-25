/**
 * A percentage, as a ring — the same recipe `ChallengeRing` already
 * uses, generalised past "done of total challenges" to any 0–100
 * reading. `Declutter`'s house-overall figure is the first other
 * caller: asked for directly, "we should also ensure each page has
 * some sort of interesting visual and its not just all cards" — Base
 * already had `Meter` bars everywhere and nothing else, so the ring
 * gives its one headline number (how clear the house is) the same
 * "second reading, not a replacement" treatment `ChallengePass` gets.
 *
 * **`lg` and up only, same as `ChallengeRing`.** Mobile keeps exactly
 * the linear meter it always had; the ring is the wide-screen glance a
 * `Meter` bar cannot give on its own.
 */

const SIZE = 56
const CENTRE = SIZE / 2
const RADIUS = 22
const STROKE = 5

export function PercentRing({
  value,
  label,
  good = false,
}: {
  /** 0–100. Clamped, so a caller passing a raw reading cannot overdraw the ring. */
  readonly value: number
  readonly label: string
  /** Lit green instead of the accent colour, for a reading that reads as "good" already. */
  readonly good?: boolean
}) {
  const circumference = 2 * Math.PI * RADIUS
  const fraction = Math.max(0, Math.min(1, value / 100))
  const filled = fraction * circumference
  const tone = good ? 'var(--color-good-500)' : 'var(--color-accent-500)'

  return (
    <svg
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className="hidden shrink-0 lg:block"
      width={SIZE}
      height={SIZE}
      role="img"
      aria-label={label}
    >
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS}
        fill="none"
        stroke="var(--color-ink-800)"
        strokeWidth={STROKE}
      />
      {/* The same lit-ring treatment `AvatarPortrait`'s level ring and
          `ChallengeRing` already use. */}
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS}
        fill="none"
        stroke={tone}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${String(filled)} ${String(circumference)}`}
        transform={`rotate(-90 ${String(CENTRE)} ${String(CENTRE)})`}
        style={{ filter: `drop-shadow(0 0 4px ${tone})` }}
      />
      <text
        x={CENTRE}
        y={CENTRE}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--text-primary)"
        fontSize={14}
        fontWeight={600}
      >
        {Math.round(value)}%
      </text>
    </svg>
  )
}
