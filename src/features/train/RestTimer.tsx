import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

/**
 * The rest timer.
 *
 * Derived from an absolute start time passed in as a prop rather than
 * counting a number down, because a phone locked between sets suspends
 * the tab and any interval with it. A countdown implemented as
 * `remaining -= 1` every second would pause with the screen and report
 * ninety seconds of rest after four minutes in a pocket — worse than no
 * timer, because it is trusted.
 *
 * Neither source app had a rest timer at all, despite both prescribing
 * work where rest length changes the training effect.
 */

interface Props {
  /** When the set that triggered this was logged, as epoch milliseconds. */
  readonly startedAt: number
  readonly seconds: number
  /**
   * The set this rest leads up to, so the bar can be loaded while the
   * clock runs rather than after it. Absent once nothing is pending.
   */
  readonly next?: { readonly title: string; readonly detail: string } | undefined
  readonly onDismiss: () => void
}

export function RestTimer({ startedAt, seconds, next, onDismiss }: Props) {
  /**
   * Milliseconds the lifter has spent with the timer paused. Kept as a
   * shift applied to the deadline rather than as a stopped clock, so the
   * remaining time is still a pure function of the wall clock.
   */
  const [pausedFor, setPausedFor] = useState(0)
  const [pausedAt, setPausedAt] = useState<number | undefined>(undefined)
  /** Time the lifter added with +30s. A shift on the deadline, like a pause. */
  const [extraMs, setExtraMs] = useState(0)
  const [now, setNow] = useState(startedAt)

  const endsAt = startedAt + pausedFor + extraMs + seconds * 1000
  const remaining =
    pausedAt === undefined ? Math.max(0, endsAt - now) : Math.max(0, endsAt - pausedAt)

  useEffect(() => {
    if (pausedAt !== undefined) return

    const tick = (): void => {
      setNow(Date.now())
    }

    tick()
    // Recomputed from the wall clock every tick, so a suspended tab
    // catches up the moment it resumes instead of losing the time.
    const handle = window.setInterval(tick, 250)

    const onVisible = (): void => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(handle)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pausedAt])

  const elapsed = remaining <= 0

  /*
   * **The end of a rest is felt as well as seen**, once, on the change —
   * a phone face up on a bench is not being looked at. Android buzzes; iOS
   * gives a web app no vibration API, so there it is the glow alone.
   */
  useEffect(() => {
    if (!elapsed) return
    if ('vibrate' in navigator) navigator.vibrate([90, 70, 90])
  }, [elapsed])
  const total = seconds * 1000 + extraMs
  const progress = total <= 0 ? 1 : Math.min(1, 1 - remaining / total)

  /*
   * **A ring rather than a bar, and +30s rather than "again".** The bar
   * was a hairline under the numbers, and the restart icon beside it added
   * a whole second rest period — two minutes for a lifter who wanted
   * thirty seconds more. A ring is the shape a rest timer is read as from
   * across a rack, and the button says what it adds.
   */
  const ring = 2 * Math.PI * 20

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl px-3"
      /*
       * Pinned to the bottom edge and padded past the home indicator. A
       * style rather than an arbitrary Tailwind value, because `env()`
       * inside a bracket class is fragile across builds and this must not
       * resolve to zero.
       */
      style={{ paddingBottom: 'calc(0.75rem + var(--safe-bottom))' }}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          'border-ink-800 bg-ink-900/85 overflow-hidden rounded-2xl border backdrop-blur-xl shadow-[0_-12px_40px_-12px_rgb(0_0_0/80%)]',
          elapsed && 'rest-done',
        )}
      >
        {next !== undefined && (
          <p className="border-ink-800 flex items-baseline gap-2 border-b px-3 py-1.5 text-xs">
            <span className="text-ink-500 shrink-0 font-medium tracking-wide uppercase">
              Up next
            </span>
            <span className="text-ink-300 min-w-0 truncate">{next.title}</span>
            <span className="numeric text-ink-50 ml-auto shrink-0 font-semibold">
              {next.detail}
            </span>
          </p>
        )}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <svg viewBox="0 0 48 48" className="size-12 shrink-0 -rotate-90" aria-hidden>
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="var(--color-ink-800)"
              strokeWidth="4"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke={elapsed ? 'var(--color-good-500)' : 'var(--color-accent-400)'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={ring}
              strokeDashoffset={ring * (1 - progress)}
              className="transition-[stroke-dashoffset] duration-300"
            />
          </svg>

          <div className="min-w-0 flex-1">
            <p className="text-ink-500 text-[0.7rem] font-medium tracking-wide uppercase">
              {elapsed ? 'Rest complete' : pausedAt === undefined ? 'Resting' : 'Paused'}
            </p>
            <p className="numeric text-ink-50 text-2xl leading-tight font-semibold tabular-nums">
              {elapsed ? 'Go' : formatRemaining(remaining)}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            aria-label={pausedAt === undefined ? 'Pause rest timer' : 'Resume rest timer'}
            onClick={() => {
              if (pausedAt === undefined) {
                setPausedAt(Date.now())
              } else {
                setPausedFor((current) => current + (Date.now() - pausedAt))
                setPausedAt(undefined)
              }
            }}
          >
            {pausedAt === undefined ? (
              <Pause size={16} aria-hidden />
            ) : (
              <Play size={16} aria-hidden />
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            aria-label="Add thirty seconds of rest"
            onClick={() => {
              setExtraMs((current) => current + 30_000)
            }}
          >
            +30s
          </Button>

          <Button variant={elapsed ? 'primary' : 'ghost'} size="sm" onClick={onDismiss}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}

function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`
}
