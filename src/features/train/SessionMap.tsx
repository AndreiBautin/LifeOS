import { Check } from 'lucide-react'

import type { WorkoutLog } from '@/domain/logging/workout-log'
import { isEntryComplete } from '@/domain/logging/workout-log'
import { cn } from '@/lib/cn'

/**
 * The whole session down the side of a wide screen.
 *
 * On a phone the exercises are a strip of pills under the session bar,
 * because there is no room for anything else. On a desktop the player
 * was that same 672-pixel column floating in the middle of the window,
 * so the space it wasted could hold the session itself: every exercise
 * in order, a pip per working set filled as it is logged, the current
 * one lit, each a press away. It replaces the strip there rather than
 * repeating it.
 */
export function SessionMap({
  workout,
  current,
  runs,
  nameOf,
  onGo,
}: {
  readonly workout: WorkoutLog
  readonly current: number
  /** Index of the first entry of each warm-up run, mapped to the whole run. */
  readonly runs: (at: number) => readonly number[] | undefined
  readonly nameOf: (id: WorkoutLog['entries'][number]['exerciseId']) => string
  readonly onGo: (index: number) => void
}) {
  return (
    <nav
      aria-label="Session"
      className="card hidden p-3 lg:sticky lg:top-28 lg:block lg:self-start"
    >
      <p className="text-ink-500 px-2 pb-2 text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
        This session
      </p>
      <ol className="space-y-1">
        {workout.entries.map((entry, index) => {
          const run = runs(index)
          if (run !== undefined && run[0] !== index) return null
          const entries = (run ?? [index]).flatMap((at) => workout.entries[at] ?? [])
          const sets = entries.flatMap((one) =>
            run === undefined ? one.sets.filter((set) => !set.isWarmup) : one.sets,
          )
          const done = entries.every((one) => isEntryComplete(one))
          const active = run === undefined ? current === index : run.includes(current)

          return (
            <li key={index}>
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => {
                  onGo(index)
                }}
                className={cn(
                  'flex w-full flex-col gap-1.5 rounded-xl px-2.5 py-2 text-left transition-colors',
                  active ? 'bg-accent-500/12 ring-accent-500/50 ring-1' : 'hover:bg-ink-800/50',
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      active ? 'text-ink-50 font-semibold' : done ? 'text-ink-500' : 'text-ink-300',
                    )}
                  >
                    {run === undefined ? nameOf(entry.exerciseId) : 'Warm-up'}
                  </span>
                  {done && <Check size={14} className="text-good-500 shrink-0" aria-label="Done" />}
                </span>
                <span className="flex gap-1" aria-hidden>
                  {sets.map((set, at) => (
                    <span
                      key={at}
                      className={cn(
                        'h-1.5 flex-1 rounded-full',
                        set.outcome === 'completed'
                          ? 'bg-accent-400'
                          : set.outcome === 'skipped'
                            ? 'bg-ink-700'
                            : 'bg-ink-800',
                      )}
                    />
                  ))}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
