/**
 * A count against a real denominator, as a ring — `done` over `total`,
 * shown as the raw count rather than a percentage, because a percentage
 * would launder a number the caller already has and can state honestly.
 *
 * **Generalised out of `ChallengeRing`.** That component was written for
 * one card and the same "done of a real total" shape turned out to be
 * exactly what "goals met today" and "places visited" both needed too —
 * a third and fourth caller is where a copy stops being cheaper than a
 * shared component. `ChallengePass` still gets its own tone (green once
 * every challenge is done); every caller does, through the same
 * `complete` rule.
 *
 * **`lg` and up only, like every ring in this family.** Mobile keeps
 * whatever linear reading the card already had; this is the "fill the
 * freed space with a real chart" answer for the width only a wider
 * screen has.
 */

const SIZE = 56
const CENTRE = SIZE / 2
const RADIUS = 22
const STROKE = 5

export function CountRing({
  done,
  total,
  label,
}: {
  readonly done: number
  readonly total: number
  readonly label: string
}) {
  const circumference = 2 * Math.PI * RADIUS
  const fraction = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0
  const filled = fraction * circumference
  const complete = total > 0 && done === total
  const tone = complete ? 'var(--color-good-500)' : 'var(--color-accent-500)'

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
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS}
        fill="none"
        stroke={tone}
        strokeWidth={STROKE}
        strokeLinecap="round"
        /* Dashed as one full-length stroke offset back by what is not
             yet filled, so `.ring-draw` can start it at empty and let it
             run round to the value. */
        className="ring-draw"
        strokeDasharray={`${String(circumference)} ${String(circumference)}`}
        strokeDashoffset={circumference - filled}
        transform={`rotate(-90 ${String(CENTRE)} ${String(CENTRE)})`}
        style={
          {
            filter: `drop-shadow(0 0 4px ${tone})`,
            '--ring-full': `${String(circumference)}px`,
          } as React.CSSProperties
        }
      />
      <text
        x={CENTRE}
        y={CENTRE}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--text-primary)"
        fontSize={16}
        fontWeight={600}
      >
        {done}
      </text>
    </svg>
  )
}
