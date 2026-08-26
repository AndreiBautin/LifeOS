import { History, ListChecks, Play, Plus, SkipForward } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { WorkoutReport } from '@/application/use-cases/training/finish-workout'
import { useSettings } from '@/app/context'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUP_LABELS } from '@/domain/exercises/taxonomy'
import type { ProgramDay } from '@/domain/programs/program'
import type { SetPrescription } from '@/domain/programs/prescription'
import { describeReps } from '@/domain/programs/prescription'
import { clampPosition, dayAt, weekAt } from '@/application/use-cases/programs/current-program'
import { STARTING_POSITION } from '@/domain/programs/position'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'

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
 * The training screen.
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
      {/*
        Plan and History live here rather than in the navigation. The bottom
        bar holds six destinations on a phone and the hub needs a slot for
        every absorbed app — so the tabs are for what is opened daily, and
        training's two review screens are reached from the training screen.
      */}
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Train</h1>
          <p className="text-ink-500 mt-0.5 text-sm">{program.data?.name ?? 'Loading…'}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Link to="/plan" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
            <ListChecks size={16} aria-hidden />
            Plan
          </Link>
          <Link to="/history" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
            <History size={16} aria-hidden />
            History
          </Link>
        </div>
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

            <VolumeTargets day={nextDay} />

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
 * What the day is actually trying to deliver, per muscle.
 *
 * The per-exercise counts above it are the *current split*, not the
 * plan. RTS back-off volume is discovered rather than prescribed — you
 * stop when the implied max has dropped by the day's allowance — and
 * `replanAccessoryVolume` resizes the accessories from whatever the
 * strength work turned out to be. So "2 × Dips" is a number the session
 * will change under you, while "chest 6" is the number it is changing it
 * to. Showing only the first states a precision the app does not have
 * and hides the figure that survives.
 *
 * Credited sets, so a muscle paid half by a compound reads the same here
 * as it does everywhere else. Ordered by size because the first two or
 * three are what the day is *for* and the tail is rounding.
 */
function VolumeTargets({ day }: { day: ProgramDay }) {
  const targets = Object.entries(day.volumeTargets ?? {}) as [MuscleGroup, number][]
  if (targets.length === 0) return null

  const ordered = [...targets].sort((a, b) => b[1] - a[1])

  return (
    <div className="border-ink-800 mb-4 border-t pt-3">
      <p className="text-ink-500 text-xs">
        Aiming for{' '}
        <span className="text-ink-300 numeric">
          {ordered
            .map(([muscle, sets]) => `${MUSCLE_GROUP_LABELS[muscle].toLowerCase()} ${String(sets)}`)
            .join(' · ')}
        </span>
      </p>
      <p className="text-ink-600 mt-1 text-xs">
        Set counts move with the bar — cut the back-offs short and the accessories grow to cover it.
      </p>
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
