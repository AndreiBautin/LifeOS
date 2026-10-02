import { ArrowLeftRight, Undo2 } from 'lucide-react'

import { EQUIPMENT_LABELS } from '@/domain/exercises/taxonomy'
import type { Exercise } from '@/domain/exercises/exercise'
import type { LogEntry } from '@/domain/logging/workout-log'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { cn } from '@/lib/cn'

import { useSwapOptions } from './hooks'

/**
 * The alternatives to the exercise on screen, opened in place under its
 * name.
 *
 * **Each row says why it is offered and what it will start at**: a trace
 * of shared traits — same movement, same kit — lit beside the name, and
 * last time underneath, because that is the number the swapped exercise
 * will plan from. "New" means it opens with no weight, which is the
 * honest answer for something never done here.
 */
export function SwapPanel({
  entry,
  current,
  units,
  onPick,
  busy,
}: {
  readonly entry: LogEntry
  readonly current: Exercise | undefined
  readonly units: WeightUnit
  readonly onPick: (exercise: Exercise) => void
  readonly busy: boolean
}) {
  const options = useSwapOptions(entry, true)

  if (options.data === undefined) {
    return <div className="skeleton mt-3 h-40 rounded-xl" aria-hidden />
  }
  if (options.data.length === 0) {
    return <p className="text-ink-500 mt-3 text-sm">Nothing else here trains the same muscle.</p>
  }

  return (
    <ul className="mt-3 space-y-1.5" aria-label="Swap for">
      {options.data.map(({ exercise, programmed, last }) => {
        const traits = [
          { on: exercise.pattern === current?.pattern, label: 'Movement' },
          { on: exercise.equipment === current?.equipment, label: 'Kit' },
          { on: exercise.isCompound === current?.isCompound, label: 'Type' },
        ]
        return (
          <li key={exercise.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onPick(exercise)
              }}
              className={cn(
                'tap-target hover:border-accent-500/50 flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-60',
                programmed ? 'border-accent-500/40 bg-accent-500/10' : 'border-ink-700/60',
              )}
            >
              {programmed ? (
                <Undo2 size={16} className="text-accent-400 shrink-0" aria-hidden />
              ) : (
                <ArrowLeftRight size={16} className="text-ink-500 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="text-ink-50 block truncate text-sm font-medium">
                  {programmed ? `Back to ${exercise.name}` : exercise.name}
                </span>
                <span className="text-ink-500 numeric block truncate text-xs">
                  {EQUIPMENT_LABELS[exercise.equipment]} ·{' '}
                  {last === undefined
                    ? 'New — opens with no weight'
                    : `Last ${last.load > 0 ? `${formatLoad(last.load, units)} × ` : ''}${last.reps.join(', ')}`}
                </span>
              </span>
              {!programmed && (
                <span
                  className="flex shrink-0 gap-1"
                  role="img"
                  aria-label={`Shares ${
                    traits
                      .filter((one) => one.on)
                      .map((one) => one.label.toLowerCase())
                      .join(', ') || 'only the muscle'
                  }`}
                >
                  {traits.map((trait) => (
                    <span
                      key={trait.label}
                      title={trait.label}
                      className={cn(
                        'h-3.5 w-1.5 rounded-full',
                        trait.on ? 'bg-accent-500' : 'bg-ink-700',
                      )}
                    />
                  ))}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
