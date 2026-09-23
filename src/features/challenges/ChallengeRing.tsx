/**
 * The season's challenge pass, as a ring rather than a line.
 *
 * **A second reading of the same fraction the bar under it draws** —
 * `done` over `total`, the same real denominator `ChallengePass`'s own
 * doc insists on, never a percent taken on faith. `lg` and up only, so
 * mobile keeps exactly the linear meter it always had.
 */

const SIZE = 56
const CENTRE = SIZE / 2
const RADIUS = 22
const STROKE = 5

export function ChallengeRing({ done, total }: { readonly done: number; readonly total: number }) {
  const circumference = 2 * Math.PI * RADIUS
  const fraction = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0
  const filled = fraction * circumference
  const complete = total > 0 && done === total

  return (
    <svg
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className="hidden shrink-0 lg:block"
      width={SIZE}
      height={SIZE}
      role="img"
      aria-label={`${String(done)} of ${String(total)} challenges finished`}
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
        stroke={complete ? 'var(--color-good-500)' : 'var(--color-accent-500)'}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${String(filled)} ${String(circumference)}`}
        transform={`rotate(-90 ${String(CENTRE)} ${String(CENTRE)})`}
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
