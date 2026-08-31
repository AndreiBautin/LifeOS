import { CheckCircle2, ChevronLeft, ChevronRight, XCircle } from 'lucide-react'
import { useState } from 'react'

import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import type { LogEntry, WorkoutLog } from '@/domain/logging/workout-log'
import { useSettings } from '@/app/context'
import { backoffStandingFor } from '@/domain/framework/backoff-stop'
import { BACKOFF_VARIANT } from '@/domain/framework/replan-backoffs'
import {
  isEntryComplete,
  loggedVolume,
  remainingSets,
  totalWorkingSets,
} from '@/domain/logging/workout-log'
import { slotRoleLabel, slotRoleTone, slotVariant } from '@/domain/programs/program'
import { MUSCLE_GROUP_LABELS } from '@/domain/exercises/taxonomy'
import type { WeightUnit } from '@/domain/units/weight'
import { sessionProgress } from '@/domain/volume/session-target'
import { Badge, Button, Card } from '@/components/shared/primitives'
import { useKeepAwake } from '@/shared/hooks/useKeepAwake'
import { cn } from '@/lib/cn'

import { useClearSet, useLogSet } from './hooks'
import { RestTimer } from './RestTimer'
import { SetRow } from './SetRow'

/**
 * Working through a session, one exercise at a time.
 *
 * One exercise fills the screen rather than a scrolling list of all of
 * them. Between sets a lifter is looking for one number, and paging
 * through six exercises to find it — StrengthFlow's design — is worse on
 * a phone than a next/previous pair that keeps the current lift under the
 * thumb. LiftTracker had the paging right and then made logging each set
 * a separate page load.
 */

interface Props {
  readonly workout: WorkoutLog
  readonly exercises: readonly Exercise[]
  readonly units: WeightUnit
  readonly restSeconds: number
  readonly keepAwake: boolean
  readonly onFinish: () => void
  readonly onAbandon: () => void
}

/**
 * The stopping rule, on the screen, at the moment it fires.
 *
 * **This is the half of RTS that was never wired up.** `evaluateFatigue`
 * had no caller outside its own test, so the app planned back-off slots,
 * printed a note saying "when one comes in at RPE 8 you are done", and
 * never read the RPE. Reported from real use: RPE 8 on the second set,
 * and nothing happened.
 *
 * **It reports and offers; it does not act.** The remaining sets are not
 * cleared automatically — the rule is a reading of a self-reported RPE,
 * and a session that deleted work on the strength of one tap would be
 * hard to argue with when the tap was wrong. One button does it, and the
 * sets can be logged anyway if the lifter disagrees.
 */
function BackoffStop({
  workout,
  entry,
  fatiguePercent,
  onSkipRest,
  busy,
}: {
  readonly workout: WorkoutLog
  readonly entry: LogEntry
  readonly fatiguePercent: number
  readonly onSkipRest: () => void
  readonly busy: boolean
}) {
  if (entry.variant !== BACKOFF_VARIANT) return null

  const standing = backoffStandingFor(workout, entry.exerciseId, fatiguePercent)
  if (standing === undefined) return null

  const { state, remaining } = standing

  /*
   * Silent until there is something to say. Before the target is reached
   * the note on the slot already states the rule, and a running "2.1% of
   * 5%" on every set would be a number to watch instead of a bar to
   * lift.
   */
  if (!state.shouldStop || remaining === 0) return null

  return (
    <Card className="border-good-500/40 mb-3">
      <p className="text-good-500 text-sm font-medium">Target reached</p>
      <p className="text-ink-300 mt-1 text-sm">{state.reason}</p>
      <Button
        variant="outline"
        size="sm"
        full
        className="mt-3"
        disabled={busy}
        onClick={onSkipRest}
      >
        Done here — skip the last {remaining === 1 ? 'set' : `${String(remaining)} sets`}
      </Button>
      <p className="text-ink-700 mt-2 text-xs">
        Or log them anyway. This reads the RPE you typed, and you are the one who typed it.
      </p>
    </Card>
  )
}

export function SessionPlayer({
  workout,
  exercises,
  units,
  restSeconds,
  keepAwake,
  onFinish,
  onAbandon,
}: Props) {
  const [index, setIndex] = useState(() => firstIncompleteIndex(workout))
  const [openSet, setOpenSet] = useState<number | undefined>(undefined)
  const [restStartedAt, setRestStartedAt] = useState<number | undefined>(undefined)
  const [confirmingAbandon, setConfirmingAbandon] = useState(false)

  const { settings } = useSettings()
  const logSet = useLogSet(workout.id)
  const clearSet = useClearSet(workout.id)

  useKeepAwake(keepAwake)

  const entry = workout.entries[index]
  const nameOf = (id: ExerciseId): string =>
    exercises.find((exercise) => exercise.id === id)?.name ?? id

  const outstanding = remainingSets(workout)
  const loggedSets = totalWorkingSets(workout)

  if (entry === undefined) {
    return (
      <Card className="text-center">
        <p className="text-ink-100 font-medium">This session has no exercises.</p>
        <p className="text-ink-500 mt-1 text-sm">
          Add some from the program, or finish and log it as a rest day.
        </p>
        <Button variant="primary" full className="mt-4" onClick={onFinish}>
          Finish session
        </Button>
      </Card>
    )
  }

  return (
    <div className="pb-24">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-ink-500 text-xs font-medium tracking-wide uppercase">
              {workout.title}
            </p>
            <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">
              {nameOf(entry.exerciseId)}
            </h1>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <Badge tone={slotRoleTone(entry.role)}>{slotRoleLabel(entry.role)}</Badge>
            {slotVariant(entry) !== '' && <Badge tone="sub">{slotVariant(entry)}</Badge>}
          </span>
        </div>

        <p className="text-ink-500 mt-1 text-sm">
          Exercise {index + 1} of {workout.entries.length} ·{' '}
          {outstanding === 0 ? 'all sets logged' : `${String(outstanding)} sets left`}
        </p>
      </header>

      <BackoffStop
        workout={workout}
        entry={entry}
        fatiguePercent={settings.fatiguePercent}
        busy={logSet.isPending}
        onSkipRest={() => {
          /*
           * Skipped, not cleared. "I chose not to do this" is a recorded
           * outcome and `pending` means the session was never finished —
           * the volume count reads them differently, and stopping on the
           * rule is a decision rather than an abandonment.
           */
          entry.sets.forEach((one, setIndex) => {
            if (one.outcome !== 'pending') return
            logSet.mutate({ entryIndex: index, setIndex, result: { outcome: 'skipped' } })
          })
        }}
      />

      <div className="space-y-2">
        {entry.sets.map((set, setIndex) => (
          <SetRow
            key={setIndex}
            set={set}
            index={setIndex}
            entryIndex={index}
            exerciseId={entry.exerciseId}
            workoutId={workout.id}
            variant={entry.variant}
            units={units}
            isOpen={openSet === setIndex}
            onOpen={() => {
              setOpenSet(setIndex)
            }}
            onLog={(result) => {
              // Spread conditionally rather than passing `undefined`
              // through: an absent number and a number that is explicitly
              // unknown are different things to the log, and only the
              // first is meant here.
              logSet.mutate(
                {
                  entryIndex: index,
                  setIndex,
                  result: {
                    ...(result.load !== undefined ? { load: result.load } : {}),
                    ...(result.reps !== undefined ? { reps: result.reps } : {}),
                    ...(result.rpe !== undefined ? { rpe: result.rpe } : {}),
                    outcome: 'completed',
                  },
                },
                {
                  onSuccess: () => {
                    setOpenSet(undefined)
                    // A warm-up does not earn a rest timer.
                    if (!set.isWarmup) setRestStartedAt(Date.now())
                  },
                },
              )
            }}
            onSkip={() => {
              logSet.mutate(
                { entryIndex: index, setIndex, result: { outcome: 'skipped' } },
                {
                  onSuccess: () => {
                    setOpenSet(undefined)
                  },
                },
              )
            }}
            onClear={() => {
              clearSet.mutate(
                { entryIndex: index, setIndex },
                {
                  onSuccess: () => {
                    setOpenSet(undefined)
                  },
                },
              )
            }}
          />
        ))}
      </div>

      {entry.notes !== undefined && (
        <p className="text-ink-500 mt-3 text-sm italic">{entry.notes}</p>
      )}

      <VolumeTally workout={workout} exercises={exercises} />

      <nav className="mt-6 flex items-center gap-2" aria-label="Exercise navigation">
        <Button
          variant="outline"
          onClick={() => {
            setIndex((current) => Math.max(0, current - 1))
            setOpenSet(undefined)
          }}
          disabled={index === 0}
          aria-label="Previous exercise"
        >
          <ChevronLeft size={18} aria-hidden />
        </Button>

        <div className="flex flex-1 justify-center gap-1.5" aria-hidden>
          {workout.entries.map((candidate, candidateIndex) => (
            <span
              key={candidateIndex}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                candidateIndex === index
                  ? 'bg-accent-500'
                  : isEntryComplete(candidate)
                    ? 'bg-good-500/50'
                    : 'bg-ink-800',
              )}
            />
          ))}
        </div>

        <Button
          variant="outline"
          onClick={() => {
            setIndex((current) => Math.min(workout.entries.length - 1, current + 1))
            setOpenSet(undefined)
          }}
          disabled={index === workout.entries.length - 1}
          aria-label="Next exercise"
        >
          <ChevronRight size={18} aria-hidden />
        </Button>
      </nav>

      <Button variant="primary" size="lg" full className="mt-6" onClick={onFinish}>
        <CheckCircle2 size={20} aria-hidden />
        {outstanding === 0 ? 'Finish session' : `Finish (${String(outstanding)} sets unlogged)`}
      </Button>

      {/*
        The way out of a session opened by mistake. Confirmed inline
        rather than through a dialog, because the wording has to change
        with what is at stake: with nothing logged this throws away
        nothing, and with sets logged it keeps them.
      */}
      {confirmingAbandon ? (
        <div className="border-bad-500/40 bg-bad-500/10 mt-3 rounded-lg border p-3">
          <p className="text-ink-50 text-sm font-medium">
            {loggedSets === 0
              ? 'Discard this session?'
              : `Abandon, keeping ${String(loggedSets)} logged set${loggedSets === 1 ? '' : 's'}?`}
          </p>
          <p className="text-ink-300 mt-1 text-sm">
            {loggedSets === 0
              ? 'Nothing has been logged, so nothing is lost. The program stays on this day.'
              : 'The sets you logged are kept and still count toward your volume. The program stays on this day, so you can run it again or skip it.'}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                onAbandon()
              }}
            >
              {loggedSets === 0 ? 'Discard' : 'Abandon'}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setConfirmingAbandon(false)
              }}
            >
              Keep training
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          full
          className="mt-2"
          onClick={() => {
            setConfirmingAbandon(true)
          }}
        >
          <XCircle size={16} aria-hidden />
          Abandon session
        </Button>
      )}

      {restStartedAt !== undefined && (
        <RestTimer
          seconds={restSeconds}
          startedAt={restStartedAt}
          onDismiss={() => {
            setRestStartedAt(undefined)
          }}
        />
      )}
    </div>
  )
}

function firstIncompleteIndex(workout: WorkoutLog): number {
  const found = workout.entries.findIndex((entry) => !isEntryComplete(entry))
  return found === -1 ? 0 : found
}

/**
 * How much of the day's target has actually been done.
 *
 * The one thing the plan cannot know in advance. RTS back-off volume is
 * discovered — you stop when the implied max has fallen by the day's
 * allowance — but the assembler has to materialise something, so it
 * materialises the cap and the accessory work is scheduled against it. A
 * lifter who stops at two back-offs instead of four leaves the gym
 * several sets under a session that reports itself complete.
 *
 * So the session says where it stands, and the lifter decides. That is
 * the same shape as everything else here: the app supplies the number and
 * declines to make the decision. Two more sets of dips, or not, but
 * knowingly.
 *
 * Counted by `loggedVolume`, which is what the planner uses on the other
 * side of the comparison. A tally measured by different rules from the
 * target it sits next to would be worse than no tally.
 */
function VolumeTally({
  workout,
  exercises,
}: {
  readonly workout: WorkoutLog
  readonly exercises: readonly Exercise[]
}) {
  const targets = workout.volumeTargets
  if (targets === undefined) return null

  const done = loggedVolume(workout, (id) => exercises.find((exercise) => exercise.id === id))
  const rows = sessionProgress(targets, done)
  if (rows.length === 0) return null

  const owed = rows.filter((row) => row.remaining > 0)

  return (
    <Card className="mt-4">
      <p className="text-ink-500 text-xs">
        {owed.length === 0
          ? 'Every muscle this day is for has hit its target.'
          : 'What this day set out to deliver, and what you have done.'}
      </p>

      <ul className="mt-2 space-y-1.5">
        {rows.map((row) => {
          const share = row.target === 0 ? 1 : Math.min(1, row.done / row.target)

          return (
            <li key={row.muscle} className="flex items-center gap-3">
              <span className="text-ink-300 w-24 shrink-0 text-xs">
                {MUSCLE_GROUP_LABELS[row.muscle]}
              </span>

              <span className="bg-ink-850 h-1.5 flex-1 overflow-hidden rounded-full">
                <span
                  className={cn(
                    'block h-full rounded-full',
                    row.remaining > 0 ? 'bg-warn-500' : 'bg-good-500',
                  )}
                  style={{ width: `${String(Math.round(share * 100))}%` }}
                />
              </span>

              <span className="numeric text-ink-500 w-14 shrink-0 text-right text-xs">
                {row.done} / {row.target}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
