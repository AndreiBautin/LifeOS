import { cn } from '@/lib/cn'

/**
 * A bar that fills, and refuses to be drawn without a real denominator.
 *
 * The signature is the rule: `value` and `of`, both required, both
 * numbers that mean something outside this component. There is no
 * `percent` prop, because a percentage is where the denominator goes to
 * hide — a bar at 70% against a threshold this app invented looks
 * exactly like a bar at 70% of your own previous season, and only one of
 * those is a measurement. Every caller has to name what it is dividing
 * by, and `docs/GAME_MODEL.md` decides whether that is allowed to exist.
 *
 * `of <= 0` renders the track alone rather than a full bar or a NaN one.
 * Nothing over nothing is not complete.
 */

export type MeterTone = 'accent' | 'good' | 'warn' | 'bad' | 'cool'

const TONE_STOPS: Record<MeterTone, readonly [string, string]> = {
  accent: ['var(--color-accent-600)', 'var(--color-accent-400)'],
  good: ['var(--color-good-500)', 'var(--color-good-500)'],
  warn: ['var(--color-warn-500)', 'var(--color-warn-500)'],
  bad: ['var(--color-bad-500)', 'var(--color-bad-500)'],
  cool: ['var(--color-cool-500)', 'var(--color-cool-500)'],
}

export function Meter({
  value,
  of,
  tone = 'accent',
  glow = false,
  height = 8,
  className,
  label,
}: {
  readonly value: number
  /** What `value` is out of. Must be something a person could check. */
  readonly of: number
  readonly tone?: MeterTone
  /** A lit bar, for the one or two on a screen that are the point of it. */
  readonly glow?: boolean
  readonly height?: number
  readonly className?: string
  /** Screen-reader text. The bar is a graphic; this is what it says. */
  readonly label?: string
}) {
  const fraction = of > 0 ? Math.max(0, Math.min(1, value / of)) : 0
  const [from, to] = TONE_STOPS[tone]

  return (
    <div
      className={cn('bg-ink-850 w-full overflow-hidden rounded-full', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(label === undefined ? {} : { 'aria-label': label })}
    >
      <div
        className="meter-fill h-full rounded-full"
        style={{
          width: `${String(fraction * 100)}%`,
          backgroundImage: `linear-gradient(90deg, ${from}, ${to})`,
          ...(glow && fraction > 0 ? { boxShadow: `0 0 8px ${to}` } : {}),
        }}
      />
    </div>
  )
}

/**
 * A row of bars over a shared scale — a month, a week, a session.
 *
 * The scale is the caller's, not the largest value present. Normalising
 * to the tallest bar is the tempting default and it lies by omission:
 * every series then looks equally dramatic, and a season where nothing
 * happened is indistinguishable from one where a great deal did.
 */
export function BarSeries({
  bars,
  of,
  tone = 'accent',
  height = 48,
  className,
}: {
  readonly bars: readonly { readonly key: string; readonly value: number; readonly label: string }[]
  readonly of: number
  readonly tone?: MeterTone
  readonly height?: number
  readonly className?: string
}) {
  const [, to] = TONE_STOPS[tone]

  return (
    <div className={cn('flex items-end gap-2', className)}>
      {bars.map((bar) => {
        const fraction = of > 0 ? Math.max(0, Math.min(1, bar.value / of)) : 0

        return (
          <div key={bar.key} className="min-w-0 flex-1">
            <div className="flex items-end" style={{ height }}>
              <div
                className="meter-fill w-full rounded-t-sm"
                style={{
                  /* A floor of two pixels, so a month with nothing in it
                     is a visible flat line rather than a gap that reads
                     as missing data. */
                  height: `${String(Math.max(2, fraction * height))}px`,
                  backgroundImage: `linear-gradient(180deg, ${to}, color-mix(in oklab, ${to} 45%, transparent))`,
                }}
              />
            </div>
            <p className="text-ink-500 numeric mt-1 truncate text-center text-xs">{bar.label}</p>
          </div>
        )
      })}
    </div>
  )
}
