import { Check, Flame } from 'lucide-react'
import { useState } from 'react'

import type { ExerciseId } from '@/domain/ids/ids'
import type { LogEntry, WorkoutLog } from '@/domain/logging/workout-log'
import { isEntryComplete } from '@/domain/logging/workout-log'
import { describePrescription } from '@/domain/programs/prescription'
import { Button } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

import { useClearSet, useLogSet } from './hooks'

/**
 * The run of warm-up rows at the top of a session, as one checklist.
 *
 * **It was a page per movement.** A session opened on "Roll Upper Back,
 * 1 of 8", one tap, Up next, "Roll Lats", one tap, Up next — five screens
 * before the first bar. Nothing about a foam roll needs a screen: there
 * is no number to read and none to type. So the run is one card, each row
 * one tap, and the whole run one tap more.
 *
 * Each row still logs its own sets, so the record is exactly what it was
 * and the rows can be unticked. The writes go one after another: a log is
 * a read-modify-write of the whole workout, and two in flight at once
 * lose one of them.
 */
export function WarmupBlock({
  workout,
  indices,
  nameOf,
}: {
  readonly workout: WorkoutLog
  readonly indices: readonly number[]
  readonly nameOf: (id: ExerciseId) => string
}) {
  const logSet = useLogSet(workout.id)
  const clearSet = useClearSet(workout.id)
  const [busy, setBusy] = useState(false)

  const entries = indices.flatMap((entryIndex) => {
    const entry = workout.entries[entryIndex]
    return entry === undefined ? [] : [{ entry, entryIndex }]
  })
  const done = entries.filter(({ entry }) => isEntryComplete(entry)).length

  const complete = async (entry: LogEntry, entryIndex: number) => {
    for (const [setIndex, set] of entry.sets.entries()) {
      if (set.outcome !== 'pending') continue
      await logSet.mutateAsync({
        entryIndex,
        setIndex,
        result: {
          outcome: 'completed',
          ...(set.plannedReps !== undefined ? { reps: set.plannedReps } : {}),
        },
      })
    }
  }

  const undo = async (entry: LogEntry, entryIndex: number) => {
    for (const setIndex of entry.sets.keys()) {
      await clearSet.mutateAsync({ entryIndex, setIndex })
    }
  }

  const run = (work: () => Promise<void>) => {
    setBusy(true)
    void work().finally(() => {
      setBusy(false)
    })
  }

  return (
    <section className="card p-4 lg:p-6" aria-labelledby="exercise-name">
      <div className="mb-1 flex items-center gap-2">
        <span className="bg-cool-500/15 text-cool-500 flex size-6 items-center justify-center rounded-md">
          <Flame size={14} aria-hidden />
        </span>
        <span className="text-ink-500 ml-auto text-xs">
          <span className="numeric text-ink-50 font-semibold">{done}</span>/{entries.length} done
        </span>
      </div>
      <h1
        id="exercise-name"
        className="text-ink-50 text-2xl font-semibold tracking-tight sm:text-3xl"
      >
        Warm-up
      </h1>
      <p className="text-ink-500 mt-1 text-sm">Not counted toward volume. Tick each as you go.</p>

      <ul className="mt-4 space-y-2">
        {entries.map(({ entry, entryIndex }) => {
          const ticked = isEntryComplete(entry)
          const first = entry.sets[0]
          return (
            <li key={entryIndex}>
              <button
                type="button"
                aria-pressed={ticked}
                disabled={busy}
                onClick={() => {
                  run(() => (ticked ? undo(entry, entryIndex) : complete(entry, entryIndex)))
                }}
                className={cn(
                  'tap-target flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-70',
                  ticked
                    ? 'border-good-500/30 bg-good-500/5'
                    : 'border-ink-800 bg-ink-900/50 hover:border-ink-700',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors',
                    ticked
                      ? 'border-good-500 bg-good-500 text-ink-950'
                      : 'border-ink-700 text-transparent',
                  )}
                  aria-hidden
                >
                  <Check size={16} strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-sm font-medium',
                      ticked ? 'text-ink-300' : 'text-ink-50',
                    )}
                  >
                    {nameOf(entry.exerciseId)}
                  </span>
                  {cue(entry.notes) !== '' && (
                    <span className="text-ink-500 block truncate text-xs">{cue(entry.notes)}</span>
                  )}
                </span>
                {first !== undefined && (
                  <span className="text-ink-500 numeric shrink-0 text-xs">
                    {describePrescription(first.prescription)}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {done < entries.length && (
        <Button
          variant="outline"
          full
          className="mt-4"
          disabled={busy}
          onClick={() => {
            run(async () => {
              for (const { entry, entryIndex } of entries) await complete(entry, entryIndex)
            })
          }}
        >
          <Check size={16} aria-hidden />
          Mark all done
        </Button>
      )}
    </section>
  )
}

/**
 * The movement's own instruction, without the sentence every warm-up
 * note opens with — the card already says it once at the top.
 */
function cue(notes: string | undefined): string {
  return (notes ?? '').replace(/^Warm-up\. Not counted toward volume\.\s*/, '')
}
