import { Play, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { WorkoutReport } from '@/application/use-cases/training/finish-workout'
import { useSettings } from '@/app/context'
import type { SetPrescription } from '@/domain/programs/prescription'
import { describeReps } from '@/domain/programs/prescription'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { cn } from '@/lib/cn'

import {
  useActiveInstance,
  useActiveWorkout,
  useExercises,
  useFinishWorkout,
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
  const { settings, athlete } = useSettings()
  const activeWorkout = useActiveWorkout()
  const activeInstance = useActiveInstance()
  const exercises = useExercises()
  const startWorkout = useStartWorkout()
  const finishWorkout = useFinishWorkout()

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
      />
    )
  }

  const instance = activeInstance.data
  const nextDay =
    instance == null
      ? undefined
      : instance.templateSnapshot.blocks[instance.blockIndex]?.weeks[instance.weekIndex]?.days[
          instance.dayIndex
        ]
  const week = instance?.templateSnapshot.blocks[instance.blockIndex]?.weeks[instance.weekIndex]

  const missingMaxes =
    instance == null
      ? []
      : instance.templateSnapshot.requiredTrainingMaxes.filter(
          (id) => athlete.trainingMaxes[id] === undefined,
        )

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Train</h1>
        <p className="text-ink-500 mt-0.5 text-sm">
          {instance == null ? 'No program running' : instance.name}
        </p>
      </header>

      {missingMaxes.length > 0 && (
        <Card className="border-warn-500/40 bg-warn-500/10 mb-4">
          <p className="text-ink-50 text-sm font-medium">
            {missingMaxes.length} lift{missingMaxes.length === 1 ? '' : 's'} still need a training
            max
          </p>
          <p className="text-ink-300 mt-1 text-sm">
            Percentage-based sets cannot be given a weight until you set one. The session will still
            open; those sets will show the percentage instead of a number.
          </p>
          <Link to="/settings" className={cn(buttonStyles({ variant: 'outline' }), 'mt-3')}>
            Set training maxes
          </Link>
        </Card>
      )}

      {instance != null && nextDay !== undefined ? (
        <Section title="Next session" description={week?.label}>
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-ink-50 text-lg font-semibold">{nextDay.label}</h3>
              <div className="flex gap-1.5">
                {week?.isDeload === true && <Badge tone="warn">deload</Badge>}
                <Badge>cycle {instance.cycleNumber}</Badge>
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
                  <span className="text-ink-500 numeric shrink-0">
                    {countedSets(slot.sets)} × {workingRepsLabel(slot.sets)}
                  </span>
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
          </Card>
        </Section>
      ) : (
        <Empty title={instance == null ? 'No program running' : 'This program is finished'}>
          <p>
            {instance == null
              ? 'Pick a program to follow, or log a session on its own.'
              : 'Start another program, or log sessions on their own.'}
          </p>
          <Link to="/programs" className={cn(buttonStyles({ variant: 'primary' }), 'mt-4')}>
            Browse programs
          </Link>
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

/** The rep target of a slot's first working set, for a one-line preview. */
function workingRepsLabel(sets: readonly SetPrescription[]): string {
  const first = sets.find((set) => set.isWarmup !== true) ?? sets[0]
  return first === undefined ? '—' : describeReps(first.reps)
}
