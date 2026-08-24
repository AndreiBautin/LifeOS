import { Check, Minus, SkipForward } from 'lucide-react'
import { useState } from 'react'

import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { LoggedSet } from '@/domain/logging/workout-log'
import { describePrescription } from '@/domain/programs/prescription'
import { formatLoad } from '@/domain/units/weight'
import type { WeightUnit } from '@/domain/units/weight'
import { Badge, Button, NumberField } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

import { usePreviousSet } from './hooks'

/**
 * One set, as a row that expands into an editor.
 *
 * The interaction the whole app is judged on. Three principles:
 *
 *   - **The prescription is always visible.** "225 × 5+" stays on the row
 *     whether or not the set has been done, so a lifter never has to
 *     remember what they were told to do.
 *   - **The previous result is the placeholder.** Not a separate line to
 *     read — the number sits in the field, greyed, so beating it is one
 *     keystroke away.
 *   - **Logging is one tap plus two numbers.** LiftTracker made logging a
 *     set a full page navigation with a round trip to the server for each
 *     of load, reps and RPE.
 */

interface Props {
  readonly set: LoggedSet
  readonly index: number
  readonly entryIndex: number
  readonly exerciseId: ExerciseId
  readonly workoutId: WorkoutId
  readonly units: WeightUnit
  readonly isOpen: boolean
  readonly onOpen: () => void
  readonly onLog: (result: {
    load?: number | undefined
    reps?: number | undefined
    rpe?: number | undefined
  }) => void
  readonly onSkip: () => void
  readonly onClear: () => void
}

export function SetRow(props: Props) {
  const { set, index, exerciseId, workoutId, units, isOpen, onOpen } = props
  const { data: previous } = usePreviousSet(exerciseId, index, workoutId)

  const done = set.outcome === 'completed' && set.completedAt !== undefined
  const skipped = set.outcome === 'skipped'

  const summary = done
    ? `${set.actualLoad === undefined ? '—' : formatLoad(set.actualLoad, units)} × ${String(set.actualReps ?? '—')}${
        set.actualRpe === undefined ? '' : ` @ ${String(set.actualRpe)}`
      }`
    : describePrescription(set.prescription)

  const plannedSummary =
    set.plannedLoad === undefined
      ? describePrescription(set.prescription)
      : `${formatLoad(set.plannedLoad, units)} × ${set.prescription.reps.kind === 'amrap' ? `${String(set.prescription.reps.minimum)}+` : String(set.plannedReps ?? '')}`

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Set ${String(index + 1)}, ${summary}. ${done ? 'Logged' : skipped ? 'Skipped' : 'Tap to log'}.`}
        className={cn(
          'tap-target flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
          done && 'border-good-500/30 bg-good-500/10',
          skipped && 'border-ink-800 bg-ink-850 opacity-60',
          !done && !skipped && 'border-ink-800 bg-ink-850 hover:border-ink-700',
        )}
      >
        <span className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
              done ? 'bg-good-500 text-black' : 'bg-ink-800 text-ink-300',
            )}
            aria-hidden
          >
            {done ? <Check size={14} /> : skipped ? <Minus size={14} /> : index + 1}
          </span>
          <span
            className={cn('numeric text-sm font-semibold', done ? 'text-good-500' : 'text-ink-100')}
          >
            {skipped ? 'Skipped' : summary}
          </span>
        </span>

        <span className="flex items-center gap-2">
          {set.isWarmup && <Badge>warm-up</Badge>}
          {set.prescription.reps.kind === 'amrap' && !done && <Badge tone="accent">AMRAP</Badge>}
          {!done && !skipped && set.plannedLoad !== undefined && (
            <span className="text-ink-500 numeric text-xs">{plannedSummary}</span>
          )}
        </span>
      </button>
    )
  }

  /**
   * The editor is a separate component, remounted whenever the row opens.
   *
   * That is what lets it seed its fields straight from props in `useState`
   * rather than pushing them in from an effect — an effect that calls
   * `setState` on open causes a cascading render, and React's own lint
   * rules now say so. The remount is the idiomatic reset.
   */
  return <SetEditorPanel {...props} previousLoad={previous?.load} previousReps={previous?.reps} />
}

interface EditorProps extends Props {
  readonly previousLoad?: number | undefined
  readonly previousReps?: number | undefined
}

function SetEditorPanel({
  set,
  index,
  entryIndex,
  units,
  onLog,
  onSkip,
  onClear,
  previousLoad,
  previousReps,
}: EditorProps) {
  // Seeded once, from the prescription. The lifter confirms rather than
  // types, which is the difference between logging a set in two seconds
  // and logging it in fifteen.
  const [load, setLoad] = useState(() =>
    String(set.actualLoad ?? set.plannedLoad ?? previousLoad ?? ''),
  )
  const [reps, setReps] = useState(() => String(set.actualReps ?? set.plannedReps ?? ''))
  const [rpe, setRpe] = useState(() => String(set.actualRpe ?? ''))

  const done = set.outcome === 'completed' && set.completedAt !== undefined

  const asNumber = (value: string): number | undefined => {
    const parsed = Number(value)
    return value.trim() === '' || !Number.isFinite(parsed) ? undefined : parsed
  }

  return (
    <div className="border-accent-500/40 bg-ink-850 rounded-xl border p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-ink-300 text-sm font-medium">
          Set {index + 1}
          <span className="text-ink-500"> · {describePrescription(set.prescription)}</span>
        </p>
        {previousLoad !== undefined && (
          <p className="text-ink-500 numeric text-xs">
            Last: {formatLoad(previousLoad, units)} × {String(previousReps ?? '—')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label={units}
          id={`load-${String(entryIndex)}-${String(index)}`}
          value={load}
          onChange={(event) => {
            setLoad(event.target.value)
          }}
          hint={previousLoad === undefined ? undefined : String(previousLoad)}
        />
        <NumberField
          label="Reps"
          id={`reps-${String(entryIndex)}-${String(index)}`}
          value={reps}
          onChange={(event) => {
            setReps(event.target.value)
          }}
          hint={previousReps === undefined ? undefined : String(previousReps)}
        />
        <NumberField
          label="RPE"
          id={`rpe-${String(entryIndex)}-${String(index)}`}
          value={rpe}
          onChange={(event) => {
            setRpe(event.target.value)
          }}
          hint="—"
        />
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          full
          onClick={() => {
            const loadValue = asNumber(load)
            const repsValue = asNumber(reps)
            const rpeValue = asNumber(rpe)

            onLog({
              ...(loadValue !== undefined ? { load: loadValue } : {}),
              ...(repsValue !== undefined ? { reps: repsValue } : {}),
              ...(rpeValue !== undefined ? { rpe: rpeValue } : {}),
            })
          }}
        >
          <Check size={18} aria-hidden />
          Log set
        </Button>
        <Button variant="ghost" onClick={onSkip} aria-label="Skip this set">
          <SkipForward size={18} aria-hidden />
        </Button>
        {done && (
          <Button variant="ghost" onClick={onClear} aria-label="Clear this set">
            <Minus size={18} aria-hidden />
          </Button>
        )}
      </div>
    </div>
  )
}
