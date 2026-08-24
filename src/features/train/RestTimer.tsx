import { Pause, Play, RotateCcw, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/shared/primitives'

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
  readonly onDismiss: () => void
}

export function RestTimer({ startedAt, seconds, onDismiss }: Props) {
  /**
   * Milliseconds the lifter has spent with the timer paused. Kept as a
   * shift applied to the deadline rather than as a stopped clock, so the
   * remaining time is still a pure function of the wall clock.
   */
  const [pausedFor, setPausedFor] = useState(0)
  const [pausedAt, setPausedAt] = useState<number | undefined>(undefined)
  const [extraCycles, setExtraCycles] = useState(0)
  const [now, setNow] = useState(startedAt)

  const endsAt = startedAt + pausedFor + extraCycles * seconds * 1000 + seconds * 1000
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
  const total = seconds * 1000
  const progress = total <= 0 ? 1 : Math.min(1, 1 - remaining / total)

  return (
    <div
      className="border-ink-800 bg-ink-900 fixed inset-x-0 bottom-16 z-30 mx-auto max-w-2xl rounded-t-2xl border-t px-4 py-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Timer size={18} className={elapsed ? 'text-good-500' : 'text-accent-400'} aria-hidden />

        <div className="flex-1">
          <p className="numeric text-ink-50 text-lg font-semibold tabular-nums">
            {elapsed ? 'Rest complete' : formatRemaining(remaining)}
          </p>
          <div className="bg-ink-800 mt-1.5 h-1 overflow-hidden rounded-full">
            <div
              className={elapsed ? 'bg-good-500 h-full' : 'bg-accent-500 h-full'}
              style={{ width: `${String(Math.round(progress * 100))}%` }}
            />
          </div>
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
          variant="ghost"
          size="sm"
          aria-label="Add another rest period"
          onClick={() => {
            setExtraCycles((current) => current + 1)
          }}
        >
          <RotateCcw size={16} aria-hidden />
        </Button>

        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Done
        </Button>
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
