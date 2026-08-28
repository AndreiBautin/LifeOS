import { cn } from '@/lib/cn'

/**
 * A line over time, with an optional corridor behind it.
 *
 * Inline SVG and no library. These are a few dozen points on a phone —
 * a charting dependency would be more bytes than the rest of the feature
 * and would bring its own opinions about axes, tooltips and colour that
 * would then have to be argued back out of it.
 *
 * The scale is **taken from the data plus the corridor**, not from zero.
 * A weight chart anchored at zero is a flat line near the top of the box
 * that shows nothing; the interesting range is the two or three pounds
 * the trend has actually moved. That is the right call here and it is
 * the wrong one for a count — so a series of counts should use
 * `BarSeries`, which is anchored at zero by construction.
 */

export interface TrendPoint {
  /** Any monotonic x — a day index, a week number. */
  readonly x: number
  readonly y: number
}

export interface Corridor {
  readonly x: number
  readonly low: number
  readonly high: number
}

const WIDTH = 320
const HEIGHT = 96
const PAD = 6

export function TrendChart({
  points,
  corridor = [],
  tone = 'var(--color-accent-500)',
  className,
  label,
}: {
  readonly points: readonly TrendPoint[]
  readonly corridor?: readonly Corridor[]
  readonly tone?: string
  readonly className?: string
  readonly label: string
}) {
  /*
   * Two points is the minimum for a line. One reading is a dot, and a
   * dot drawn on an axis it defines by itself says nothing at all — so
   * the caller gets nothing back and can say "not enough readings"
   * instead, which is true and useful.
   */
  if (points.length < 2) return null

  const ys = [...points.map((p) => p.y), ...corridor.flatMap((c) => [c.low, c.high])]
  const xs = [...points.map((p) => p.x), ...corridor.map((c) => c.x)]

  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)

  /*
   * A flat series has no range to divide by. Given a nominal one it
   * draws down the middle of the box, which is exactly what "this has
   * not moved" should look like.
   */
  const spanY = maxY - minY || 1
  const spanX = maxX - minX || 1

  const px = (x: number) => PAD + ((x - minX) / spanX) * (WIDTH - PAD * 2)
  const py = (y: number) => HEIGHT - PAD - ((y - minY) / spanY) * (HEIGHT - PAD * 2)

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${String(px(p.x))} ${String(py(p.y))}`)
    .join(' ')

  const band =
    corridor.length < 2
      ? undefined
      : [
          ...corridor.map(
            (c, i) => `${i === 0 ? 'M' : 'L'} ${String(px(c.x))} ${String(py(c.high))}`,
          ),
          ...[...corridor].reverse().map((c) => `L ${String(px(c.x))} ${String(py(c.low))}`),
          'Z',
        ].join(' ')

  return (
    <svg
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      className={cn('w-full', className)}
      style={{ height: HEIGHT }}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="trend-under" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.28" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The corridor sits behind everything, so the line reads as the
          fact and the band as the guidance. */}
      {band !== undefined && (
        <path d={band} fill="var(--color-good-500)" fillOpacity="0.12" stroke="none" />
      )}

      {/* Filled under the line, which is what makes a two-pixel movement
          legible at this size — the area changes far more visibly than
          the line's position does. */}
      <path
        d={`${line} L ${String(px(points[points.length - 1]?.x ?? 0))} ${String(HEIGHT)} L ${String(px(points[0]?.x ?? 0))} ${String(HEIGHT)} Z`}
        fill="url(#trend-under)"
        stroke="none"
      />

      <path
        d={line}
        fill="none"
        stroke={tone}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ filter: `drop-shadow(0 0 3px ${tone})` }}
      />

      {/* The latest reading, marked. It is the number the rest of the
          screen is talking about. */}
      <circle
        cx={px(points[points.length - 1]?.x ?? 0)}
        cy={py(points[points.length - 1]?.y ?? 0)}
        r="3"
        fill={tone}
        stroke="var(--surface-raised)"
        strokeWidth="1.5"
      />
    </svg>
  )
}
