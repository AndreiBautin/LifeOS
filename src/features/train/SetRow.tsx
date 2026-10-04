import { Check, Minus, SkipForward } from 'lucide-react'
import { useState } from 'react'

import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import { recordFor } from '@/domain/logging/records'
import { versusLast, type Performance } from '@/domain/logging/versus-last'
import type { LoggedSet } from '@/domain/logging/workout-log'
import { describePrescription } from '@/domain/programs/prescription'
import { formatLoad } from '@/domain/units/weight'
import type { WeightUnit } from '@/domain/units/weight'
import { Badge, Button } from '@/components/shared/primitives'
import { useSettings } from '@/app/context'
import { cn } from '@/lib/cn'

import { usePreviousSet, usePriorSets } from './hooks'
import { LoadDial } from './LoadDial'
import { Stepper } from './Stepper'
import { RecordChip } from './RecordChip'
import { RecordBurst } from './RecordBurst'
import { SwipeRow } from './SwipeRow'
import { canLogPlanned, plannedResult } from './planned'
import { VersusChip } from './VersusChip'

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
  /**
   * The exercise is bodyweight: a load is what is *added*, and none means
   * the body alone. Read as "BW" rather than "0 lb", and logged with no
   * load, the way every bodyweight set in the history already is.
   */
  readonly bodyweight?: boolean
  readonly isOpen: boolean
  readonly onOpen: () => void
  readonly onLog: (result: {
    load?: number | undefined
    reps?: number | undefined
    notes?: string | undefined
  }) => void
  readonly onSkip: () => void
  readonly onClear: () => void
  /**
   * The sets of this exercise already done in this session, before this
   * one — a record has to beat them too, or the third set of a session
   * would be named a record for beating only last week.
   */
  readonly earlier?: readonly Performance[]
  /** Slide this row once to show it can be swiped. */
  readonly peek?: boolean
  readonly onSwiped?: () => void
}

export function SetRow(props: Props) {
  const { set, index, exerciseId, workoutId, units, isOpen, onOpen, onLog } = props
  const loadText = (load: number | undefined): string =>
    describeLoad(load, units, props.bodyweight === true)
  const { data: previous } = usePreviousSet(exerciseId, index, workoutId, props.variant)
  const { data: prior } = usePriorSets(exerciseId, workoutId)

  const done = set.outcome === 'completed' && set.completedAt !== undefined
  const record =
    done && prior !== undefined && !set.isWarmup
      ? recordFor({ load: set.actualLoad, reps: set.actualReps }, [
          ...prior,
          ...(props.earlier ?? []),
        ])
      : undefined
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
    ? `${loadText(set.actualLoad)} × ${String(set.actualReps ?? '—')}${
        set.actualRpe === undefined ? '' : ` @ ${String(set.actualRpe)}`
      }`
    : describePrescription(set.prescription, repsOverride)

  const plannedSummary =
    set.plannedLoad === undefined
      ? describePrescription(set.prescription)
      : `${loadText(set.plannedLoad)} × ${set.prescription.reps.kind === 'amrap' ? `${String(set.prescription.reps.minimum)}+` : String(set.plannedReps ?? '')}`

  /*
   * **One tap logs the set as planned.** The row's own press opens the
   * editor, which was the only way in — so a set done exactly as written
   * cost two taps and a scroll to a button. The check does it in one,
   * with the planned numbers; anything else is still the editor.
   *
   * Offered only where the plan holds a number to log, or where there is
   * nothing to type: a warm-up, a block of time. An open slot with no
   * history has no load to confirm, and logging it blank would file a set
   * with no weight.
   */
  const quick = !done && !skipped && canLogPlanned(set)

  const headline = done
    ? summary
    : set.plannedLoad !== undefined
      ? plannedSummary
      : describePrescription(set.prescription, repsOverride)

  /*
   * **A note travels to the same set next time.** Written on the set it
   * explains ("belt", "left knee"), it shows on that row now and beside
   * "Last" on the same row next session — which is when it is worth
   * reading again.
   */
  const withNote = (text: string | undefined, note: string | undefined) =>
    note === undefined ? text : `${text === undefined ? '' : `${text} · `}“${note}”`
  const detail = done
    ? withNote(set.prescription.label ?? 'Logged', set.notes)
    : skipped
      ? withNote('Skipped', set.notes)
      : previous != null && (previous.load !== undefined || props.bodyweight === true)
        ? withNote(
            `Last ${loadText(previous.load)} × ${String(previous.reps ?? '—')}`,
            previous.notes,
          )
        : (set.prescription.label ??
          (set.plannedLoad === undefined && !quick ? 'Tap to enter' : undefined))

  /** Logs the set exactly as planned — the check, and a swipe right. */
  const logPlanned = () => {
    onLog(plannedResult(set, props.bodyweight === true))
  }

  if (!isOpen) {
    return (
      <SwipeRow
        onRight={quick ? logPlanned : undefined}
        onLeft={!done && !skipped && !set.isWarmup ? props.onSkip : undefined}
        peek={props.peek === true}
        {...(props.onSwiped === undefined ? {} : { onSwiped: props.onSwiped })}
      >
        <div
          className={cn(
            'flex items-stretch overflow-hidden rounded-xl border transition-colors',
            done && 'border-good-500/30 bg-good-500/10',
            skipped && 'border-ink-800 bg-ink-850 opacity-60',
            !done && !skipped && 'border-ink-800 bg-ink-850 hover:border-ink-700',
          )}
        >
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Set ${String(index + 1)}, ${headline}. ${done ? 'Logged' : skipped ? 'Skipped' : 'Edit'}.`}
            className="tap-target flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
                done ? 'bg-good-500 text-black' : 'bg-ink-800 text-ink-300',
              )}
              aria-hidden
            >
              {done ? <Check size={15} /> : skipped ? <Minus size={14} /> : index + 1}
            </span>
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  'numeric truncate text-base font-semibold',
                  done ? 'text-good-500' : 'text-ink-50',
                )}
              >
                {skipped ? describePrescription(set.prescription, repsOverride) : headline}
              </span>
              {detail !== undefined && (
                <span className="text-ink-500 numeric truncate text-xs">{detail}</span>
              )}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {/*
              A record outranks "ahead of last time": better than every
              time before says more than better than once before.
            */}
              {done && record !== undefined ? (
                <span className="relative">
                  <RecordChip kind={record} />
                  <RecordBurst completedAt={set.completedAt} />
                </span>
              ) : (
                done &&
                previous != null && (
                  <VersusChip
                    versus={versusLast(
                      { load: set.actualLoad, reps: set.actualReps },
                      { load: previous.load, reps: previous.reps },
                    )}
                    units={units}
                  />
                )
              )}
              {set.isWarmup && <Badge>warm-up</Badge>}
              {set.prescription.reps.kind === 'amrap' && !done && (
                <Badge tone="accent">AMRAP</Badge>
              )}
            </span>
          </button>

          {quick && (
            <button
              type="button"
              onClick={logPlanned}
              aria-label={`Log set ${String(index + 1)} as planned${set.plannedLoad === undefined ? '' : `: ${plannedSummary}`}`}
              className="border-ink-800 text-ink-300 hover:text-accent-400 hover:bg-accent-500/10 flex w-14 shrink-0 items-center justify-center border-l transition-colors"
            >
              <Check size={20} aria-hidden />
            </button>
          )}
        </div>
      </SwipeRow>
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
  bodyweight,
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
  const [note, setNote] = useState(() => set.notes ?? '')
  const { settings } = useSettings()

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
        {(previousLoad !== undefined || (bodyweight === true && previousReps !== undefined)) && (
          <p className="text-ink-500 numeric text-xs">
            Last: {describeLoad(previousLoad, units, bodyweight === true)} ×{' '}
            {String(previousReps ?? '—')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stepper
          label={bodyweight === true ? `Added ${units}` : units}
          id={`load-${String(entryIndex)}-${String(index)}`}
          value={load}
          onChange={setLoad}
          step={settings.roundingIncrement}
          hint={previousLoad === undefined ? undefined : String(previousLoad)}
        />
        <Stepper
          label="Reps"
          id={`reps-${String(entryIndex)}-${String(index)}`}
          value={reps}
          onChange={setReps}
          step={1}
          hint={previousReps === undefined ? undefined : String(previousReps)}
        />
      </div>
      <LoadDial
        value={load}
        onChange={setLoad}
        step={settings.roundingIncrement}
        hint={previousLoad === undefined ? undefined : String(previousLoad)}
        unit={units}
      />

      <label htmlFor={`note-${String(entryIndex)}-${String(index)}`} className="sr-only">
        Note on this set
      </label>
      <input
        id={`note-${String(entryIndex)}-${String(index)}`}
        type="text"
        maxLength={80}
        value={note}
        placeholder="Note — belt, grip, how it felt"
        onChange={(event) => {
          setNote(event.target.value)
        }}
        className="bg-ink-900 border-ink-800 text-ink-100 placeholder:text-ink-500 mt-2 w-full rounded-lg border px-3 py-2 text-sm"
      />

      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          full
          onClick={() => {
            const typed = asNumber(load)
            // Nothing added to a bodyweight set is the body alone: logged
            // with no load, as the rest of its history is.
            const loadValue = bodyweight === true && typed === 0 ? undefined : typed
            const repsValue = asNumber(reps)
            onLog({
              ...(loadValue !== undefined ? { load: loadValue } : {}),
              ...(repsValue !== undefined ? { reps: repsValue } : {}),
              notes: note.trim(),
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

/**
 * A load as a lifter reads it. On a bodyweight exercise the number is what
 * a belt adds, so none reads "BW" and five reads "BW + 5 lb" rather than
 * "0 lb" and "5 lb" — the second of which looks like a five-pound pull-up.
 */
function describeLoad(load: number | undefined, units: WeightUnit, bodyweight: boolean): string {
  if (bodyweight) return load === undefined || load <= 0 ? 'BW' : `BW + ${formatLoad(load, units)}`
  return load === undefined ? '—' : formatLoad(load, units)
}
