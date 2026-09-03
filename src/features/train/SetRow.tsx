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
  /** The entry sub-category, so a back-off compares against back-offs. */
  readonly variant?: string | undefined
  readonly units: WeightUnit
  readonly isOpen: boolean
  readonly onOpen: () => void
  readonly onLog: (result: { load?: number | undefined; reps?: number | undefined }) => void
  readonly onSkip: () => void
  readonly onClear: () => void
}

export function SetRow(props: Props) {
  const { set, index, exerciseId, workoutId, units, isOpen, onOpen } = props
  const { data: previous } = usePreviousSet(exerciseId, index, workoutId, props.variant)

  const done = set.outcome === 'completed' && set.completedAt !== undefined
  const skipped = set.outcome === 'skipped'

  /*
   * A re-planned back-off states the reps it was re-planned to.
   *
   * Only when it differs from the prescription, so nothing changes for
   * every other kind of set — and only for a fixed target, because
   * overriding a range or an AMRAP with a single number would throw away
   * what those prescriptions mean.
   */
  const repsOverride =
    set.prescription.reps.kind === 'fixed' &&
    set.plannedReps !== undefined &&
    set.plannedReps !== set.prescription.reps.reps
      ? set.plannedReps
      : undefined

  const summary = done
    ? `${set.actualLoad === undefined ? '—' : formatLoad(set.actualLoad, units)} × ${String(set.actualReps ?? '—')}${
        set.actualRpe === undefined ? '' : ` @ ${String(set.actualRpe)}`
      }`
    : describePrescription(set.prescription, repsOverride)

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
          <span className="flex flex-col">
            <span
              className={cn(
                'numeric text-sm font-semibold',
                done ? 'text-good-500' : 'text-ink-100',
              )}
            >
              {skipped ? 'Skipped' : summary}
            </span>
            {/*
              "Top set" and "Back-off" are the same exercise at the same
              rack but are not interchangeable — the top set is the reading
              everything after it is loaded from.
            */}
            {set.prescription.label !== undefined && (
              <span className="text-ink-500 text-[11px] leading-tight">
                {set.prescription.label}
              </span>
            )}
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

  const done = set.outcome === 'completed' && set.completedAt !== undefined

  const asNumber = (value: string): number | undefined => {
    const parsed = Number(value)
    return value.trim() === '' || !Number.isFinite(parsed) ? undefined : parsed
  }

  /*
   * **There is no RPE field any more, and it is a removal rather than a
   * tidy-up.** It was the third number on the row and the whole of the
   * coaching under it: an instruction before the set, a reading after it,
   * and a warning that "every load in an RTS program descends from a
   * number the lifter typed". All of that was true of RTS and none of it
   * is true of double progression, where the load descends from the
   * *reps* — so a logged RPE reached no rule, no suggestion and no
   * screen. A number nobody reads is worse than a missing one, because it
   * looks like it is doing something.
   *
   * `actualRpe` stays on the record. Old logs carry real readings and
   * history displays them; what is gone is asking for a new one.
   */

  return (
    <div className="border-accent-500/40 bg-ink-850 rounded-xl border p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-ink-300 text-sm font-medium">
          {set.prescription.label ?? `Set ${String(index + 1)}`}
          <span className="text-ink-500"> · {describePrescription(set.prescription)}</span>
        </p>
        {previousLoad !== undefined && (
          <p className="text-ink-500 numeric text-xs">
            Last: {formatLoad(previousLoad, units)} × {String(previousReps ?? '—')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
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
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          full
          onClick={() => {
            const loadValue = asNumber(load)
            const repsValue = asNumber(reps)
            onLog({
              ...(loadValue !== undefined ? { load: loadValue } : {}),
              ...(repsValue !== undefined ? { reps: repsValue } : {}),
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
