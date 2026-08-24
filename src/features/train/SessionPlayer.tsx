import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { isEntryComplete, remainingSets } from '@/domain/logging/workout-log'
import { SLOT_ROLE_LABELS } from '@/domain/programs/program'
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
}

export function SessionPlayer({
  workout,
  exercises,
  units,
  restSeconds,
  keepAwake,
  onFinish,
}: Props) {
  const [index, setIndex] = useState(() => firstIncompleteIndex(workout))
  const [openSet, setOpenSet] = useState<number | undefined>(undefined)
  const [restStartedAt, setRestStartedAt] = useState<number | undefined>(undefined)

  const logSet = useLogSet(workout.id)
  const clearSet = useClearSet(workout.id)

  useKeepAwake(keepAwake)

  const entry = workout.entries[index]
  const nameOf = (id: ExerciseId): string =>
    exercises.find((exercise) => exercise.id === id)?.name ?? id

  const outstanding = remainingSets(workout)

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
          <Badge tone={entry.role === 'main' ? 'accent' : 'neutral'}>
            {SLOT_ROLE_LABELS[entry.role]}
          </Badge>
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
