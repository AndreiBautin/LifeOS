import { CheckCircle2, ChevronLeft, ChevronRight, XCircle } from 'lucide-react'
import { useState } from 'react'

import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { isEntryComplete, remainingSets, totalWorkingSets } from '@/domain/logging/workout-log'
import { SLOT_ROLE_LABELS, SLOT_ROLE_TONES } from '@/domain/programs/program'
import type { WeightUnit } from '@/domain/units/weight'
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
          <Badge tone={SLOT_ROLE_TONES[entry.role]}>{SLOT_ROLE_LABELS[entry.role]}</Badge>
        </div>

        <p className="text-ink-500 mt-1 text-sm">
          Exercise {index + 1} of {workout.entries.length} ·{' '}
          {outstanding === 0 ? 'all sets logged' : `${String(outstanding)} sets left`}
        </p>
      </header>

      <div className="space-y-2">
        {entry.sets.map((set, setIndex) => (
          <SetRow
            key={setIndex}
            set={set}
            index={setIndex}
            entryIndex={index}
            exerciseId={entry.exerciseId}
            workoutId={workout.id}
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
