import { Play, Plus, SkipForward } from 'lucide-react'
import { useState } from 'react'

import type { WorkoutReport } from '@/application/use-cases/training/finish-workout'
import { useSettings } from '@/app/context'
import type { SetPrescription } from '@/domain/programs/prescription'
import { describeReps } from '@/domain/programs/prescription'
import { clampPosition, dayAt, weekAt } from '@/application/use-cases/programs/current-program'
import { STARTING_POSITION } from '@/domain/programs/position'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'

import {
  useActiveWorkout,
  useExercises,
  usePosition,
  useProgram,
  useAbandonWorkout,
  useFinishWorkout,
  useSkipSession,
  useStartWorkout,
} from './hooks'
import { SessionPlayer } from './SessionPlayer'
import { SessionReport } from './SessionReport'

/**
 * The screen the app opens on.
 *
 * One question answered immediately: what am I doing today? If a session
 * is already open it takes over the screen entirely — an unfinished
 * workout is the only thing that matters until it is finished, and
 * burying it behind a dashboard is how half-logged sessions get lost.
 */
export function TrainPage() {
  const { settings } = useSettings()
  const activeWorkout = useActiveWorkout()
  const program = useProgram()
  const position = usePosition()
  const exercises = useExercises()
  const startWorkout = useStartWorkout()
  const skipSession = useSkipSession()
  const finishWorkout = useFinishWorkout()
  const abandonWorkout = useAbandonWorkout()

  const [report, setReport] = useState<WorkoutReport | undefined>(undefined)

  if (report !== undefined) {
    return (
      <SessionReport
        report={report}
        units={settings.units}
        onDismiss={() => {
          setReport(undefined)
        }}
      />
    )
  }

  const workout = activeWorkout.data
  if (workout != null && exercises.data !== undefined) {
    return (
      <SessionPlayer
        workout={workout}
        exercises={exercises.data}
        units={settings.units}
        restSeconds={settings.restTimerEnabled ? 120 : 0}
        keepAwake={settings.keepScreenAwake}
        onFinish={() => {
          finishWorkout.mutate(workout.id, { onSuccess: setReport })
        }}
        onAbandon={() => {
          abandonWorkout.mutate(workout.id)
        }}
      />
    )
  }

  /*
   * The program is derived and the position is stored, so "where am I"
   * is a lookup rather than a snapshot. A lifter who has never trained
   * has no stored position yet and starts at the beginning — there is no
   * program to pick and nothing to start.
   */
  const here =
    program.data === undefined
      ? undefined
      : clampPosition(program.data, position.data ?? { ...STARTING_POSITION, startedAt: '' })

  const nextDay =
    program.data === undefined || here === undefined ? undefined : dayAt(program.data, here)
  const week =
    program.data === undefined || here === undefined ? undefined : weekAt(program.data, here)

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Train</h1>
        <p className="text-ink-500 mt-0.5 text-sm">{program.data?.name ?? 'Loading…'}</p>
      </header>

      {nextDay !== undefined ? (
        <Section title="Next session" description={week?.label}>
          <Card>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-ink-50 text-lg font-semibold">{nextDay.label}</h3>
                {nextDay.focus !== undefined && (
                  <p className="text-ink-500 mt-0.5 text-xs">{nextDay.focus}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5">
                {week?.isDeload === true && <Badge tone="warn">deload</Badge>}
                <Badge>cycle {here?.cycleNumber ?? 1}</Badge>
              </div>
            </div>

            <ul className="mb-4 space-y-1.5">
              {nextDay.slots.map((slot) => (
                <li key={slot.id} className="text-ink-300 flex justify-between gap-3 text-sm">
                  <span className="truncate">
                    {slot.exercise.kind === 'specific'
                      ? (exercises.data?.find(
                          (exercise) =>
                            slot.exercise.kind === 'specific' &&
                            exercise.id === slot.exercise.exerciseId,
                        )?.name ?? 'Unknown exercise')
                      : slot.exercise.label}
                  </span>
                  <span className="text-ink-500 numeric shrink-0">{describeSlot(slot.sets)}</span>
                </li>
              ))}
            </ul>

            <Button
              variant="primary"
              size="lg"
              full
              disabled={startWorkout.isPending}
              onClick={() => {
                startWorkout.mutate()
              }}
            >
              <Play size={20} aria-hidden />
              Start session
            </Button>

            {/*
              Skipping writes no log. A day trained elsewhere or simply
              missed still has to be got past, and an empty workout in the
              history would count as a training day against every
              frequency and volume figure.
            */}
            <Button
              variant="ghost"
              full
              className="mt-2"
              disabled={skipSession.isPending}
              onClick={() => {
                skipSession.mutate()
              }}
            >
              <SkipForward size={16} aria-hidden />
              {skipSession.isPending ? 'Skipping…' : 'Skip this one'}
            </Button>
          </Card>
        </Section>
      ) : (
        <Empty title="Building your session">
          <p>One moment — the block is put together from your priorities each time.</p>
        </Empty>
      )}

      <Section title="Or train without a program">
        <Button
          variant="outline"
          full
          disabled={startWorkout.isPending}
          onClick={() => {
            startWorkout.mutate({ freestyleTitle: 'Open session' })
          }}
        >
          <Plus size={18} aria-hidden />
          Log a session from scratch
        </Button>
      </Section>
    </div>
  )
}

/**
 * A slot summarised in one line: "4 × 3–6", or "20 min".
 *
 * A single timed set drops the count, because "1 × 20 min" invites the
 * reader to work out what one of a twenty-minute walk is.
 */
function describeSlot(sets: readonly SetPrescription[]): string {
  const first = sets.find((set) => set.isWarmup !== true) ?? sets[0]
  if (first === undefined) return '—'

  const label = describeReps(first.reps)
  if (sets.length === 1 && first.reps.kind === 'time') return label

  return `${String(countedSets(sets))} × ${label}`
}

/**
 * Sets to show for a slot.
 *
 * Working sets, except where a slot is *entirely* warm-up — a mobility
 * drill or a foam-rolling block — in which case counting only working
 * sets renders it as "0 ×", which reads as an error rather than as a
 * warm-up.
 */
function countedSets(sets: readonly SetPrescription[]): number {
  const working = sets.filter((set) => set.isWarmup !== true).length
  return working > 0 ? working : sets.length
}
