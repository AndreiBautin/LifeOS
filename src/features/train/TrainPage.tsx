import { groupOnly } from '@/domain/dailies/groups'
import { GroupedDailies } from '@/features/today/DailyGroups'
import { PageHeader } from '@/components/shared/PageHeader'
import { TRAINING } from '@/domain/base/base'
import { AddDaily, DailyRow } from '@/features/today/Dailies'
import { useTrainingHabits } from '@/features/today/dailies-hooks'
import {
  Apple,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  History,
  ListChecks,
  Play,
  Plus,
  SkipForward,
  Trophy,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { WorkoutReport } from '@/application/use-cases/training/finish-workout'
import { useServices, useSettings } from '@/app/context'
import { useQuery } from '@tanstack/react-query'
import { buildCharacter } from '@/domain/game/character'
import { totalWorkingSets } from '@/domain/logging/workout-log'
import { AttributeRow } from '@/features/character/CharacterParts'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUP_LABELS } from '@/domain/exercises/taxonomy'
import type { Exercise } from '@/domain/exercises/exercise'
import type { ProgramDay } from '@/domain/programs/program'
import { inSections } from '@/domain/programs/program'
import type { SetPrescription } from '@/domain/programs/prescription'
import { describeReps } from '@/domain/programs/prescription'
import { clampPosition, dayAt, weekAt } from '@/application/use-cases/programs/current-program'
import { STARTING_POSITION } from '@/domain/programs/position'
import { Badge, Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
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
/**
 * Habits that only mean anything on a day you lift.
 *
 * Carbs before, protein after. They are dailies in every respect — a
 * cadence, a streak, a tick — and they were on Today, where they are
 * noise on the five days a week you are not in a gym. Same argument that
 * moved house work to Base and brushing to Upkeep, applied to the set
 * that belongs to training.
 *
 * They still appear on Today when they are due, grouped under Training,
 * because Today's job is to say what the day asks for. What it stops
 * doing is listing them on the days it does not.
 */
/**
 * The strength ladders, on the screen the lifting happens on.
 *
 * **They were under the Strength trait and came back here**, asked for
 * as *"let's move the powerlifting stuff to the train section."* That is
 * the right home twice over: it is where the numbers are moved, and it
 * is beside the estimated maxes that produce them — a reading next to
 * the thing it measures needs no explaining, where the same reading
 * under a trait bar needed a rule about why two different currencies
 * were adjacent.
 *
 * **The total leads and the three lifts follow.** It is not one of the
 * area's declared ladders and could not be: it is derived from three of
 * them, and `measure.ts` deliberately names the three competition lifts
 * rather than computing it from `STRENGTH_LIFTS`. So it comes off the
 * character rather than off the sheet.
 *
 * **`buildCharacter` also computes a training-only level, which nothing
 * here draws.** Two numbers called "level" in one app, disagreeing, is
 * worse than either alone — the level is the hub's XP, and what is taken
 * from the character is only these four rows.
 */
function StrengthStandards() {
  const services = useServices()
  const { settings } = useSettings()

  const workouts = useQuery({
    queryKey: ['workouts', 'all-for-character'],
    queryFn: () => services.workouts.recent(500),
  })

  const completed = (workouts.data ?? []).filter((log) => log.status === 'completed')

  const character = buildCharacter({
    estimatedMaxes: settings.estimatedMaxes,
    ...(settings.bodyweight !== undefined ? { bodyweight: settings.bodyweight } : {}),
    sessions: completed.length,
    workingSets: completed.reduce((total, log) => total + totalWorkingSets(log), 0),
  })

  return (
    <Card>
      <CardHeading icon={<Trophy size={16} aria-hidden />} title="Standards" />
      <div className="space-y-3">
        <AttributeRow attribute={character.totalAttribute} emphasis />
        {character.lifts.map((lift) => (
          <AttributeRow key={lift.name} attribute={lift} />
        ))}
      </div>
    </Card>
  )
}

function TrainingHabits() {
  const habits = useTrainingHabits()
  const [adding, setAdding] = useState(false)

  const views = habits.data ?? []

  return (
    <Card>
      <CardHeading
        icon={<Apple size={16} aria-hidden />}
        title="Habits"
        action={
          <Button
            size="sm"
            onClick={() => {
              setAdding(!adding)
            }}
          >
            {adding ? 'Close' : 'Add'}
          </Button>
        }
      />

      {adding && (
        <AddDaily
          home={TRAINING}
          placeholder="Something you do around a session"
          onDone={() => {
            setAdding(false)
          }}
        />
      )}

      <div>
        {habits.data === undefined ? null : views.length === 0 ? (
          <Empty title="Nothing yet">
            {/*
              The days matter here in a way they do not elsewhere, and the
              reason is worth saying on the screen: the app cannot work
              them out. It knows how many days a week you train, not
              which ones.
            */}
            Pick the days you lift when you add one — the app counts your sessions, not your
            calendar, so it cannot work them out for you.
          </Empty>
        ) : (
          <GroupedDailies
            bare
            categoryOf={groupOnly}
            views={views}
            render={(view, part) => <DailyRow view={view} part={part} />}
          />
        )}
      </div>
    </Card>
  )
}

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
    <div className="space-y-4">
      {/*
        Plan and History live here rather than in the navigation. The bottom
        bar holds six destinations on a phone and the hub needs a slot for
        every absorbed app — so the tabs are for what is opened daily, and
        training's two review screens are reached from the training screen.
      */}
      <PageHeader
        title="Train"
        subtitle={program.data?.name ?? 'Loading…'}
        action={
          <>
            <Link to="/plan" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
              <ListChecks size={16} aria-hidden />
              Plan
            </Link>
            <Link to="/history" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
              <History size={16} aria-hidden />
              History
            </Link>
          </>
        }
      />

      {nextDay !== undefined ? (
        <div>
          <CardHeading icon={<Dumbbell size={16} aria-hidden />} title="Next session" />
          {week?.label !== undefined && <p className="text-ink-500 mb-2 text-sm">{week.label}</p>}
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

            <SessionOutline day={nextDay} library={exercises.data ?? []} />

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
        </div>
      ) : (
        <Empty title="Building your session">
          <p>One moment — the block is put together from your priorities each time.</p>
        </Empty>
      )}

      <StrengthStandards />

      <TrainingHabits />

      {/*
        **A button, not a section.** It was a heading over a single
        control, which is the shape `CardHeading` replaced everywhere else
        — and here even that is more than it needs: the button says what
        it does, so a title above saying the same thing twice is the
        thing being removed rather than restyled.
      */}
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
        Set counts move with the session — skip a set and the accessories grow to cover it.
      </p>
    </div>
  )
}

/**
 * A slot summarised in one line: "4 × 3–6", "1–3 × 5", or "20 min".
 *
 * A single timed set drops the count, because "1 × 20 min" invites the
 * reader to work out what one of a twenty-minute walk is.
 *
 * **A back-off block is written as a range**, because its count is not a
 * prescription. The number of back-offs is discovered in the session —
 * you keep going until a set comes in at the stop RPE — so "4 × 5" was
 * the shape of a fixed prescription making a promise the block does not
 * make. A lifter who grinds out all three because the page said three has
 * had the stopping rule taken away from them, which is the whole of what
 * makes this RTS rather than a percentage program.
 *
 * The three is still real: it is the cap, materialised as slots and
 * counted as volume, so the week is planned against the ceiling rather
 * than against a session that stops early.
 */
/**
 * The next session, cut into the parts it is performed in.
 *
 * A flat list was right at nine rows and stopped being right at sixteen.
 * Splitting the warm-up into a row per movement was the change that did
 * it — correct, because the session screen ticks off slots and seven
 * areas inside one row are seven things you skip together, but it put a
 * third of the preview in front of the part a lifter is actually
 * checking.
 *
 * The headings come from `inSections`, which groups **consecutive** runs
 * and therefore cannot reorder anything. This screen is a preview of a
 * session whose order three separate passes argued about; it has no
 * business holding a fourth opinion.
 */
function SessionOutline({
  day,
  library,
}: {
  readonly day: ProgramDay
  readonly library: readonly Exercise[]
}) {
  /*
   * The warm-up folds and nothing else does.
   *
   * It is the one part that is the same every session and asks for no
   * decision — you are not scanning it to find out what today is. Every
   * other section is; folding those would hide the answer behind a tap.
   * The count stays visible so a folded section still says how much is
   * in it, and the player walks every slot regardless of what is folded
   * here.
   */
  const [warmupOpen, setWarmupOpen] = useState(false)

  const nameOf = (slot: ProgramDay['slots'][number]): string => {
    if (slot.exercise.kind !== 'specific') return slot.exercise.label
    const id = slot.exercise.exerciseId
    return library.find((exercise) => exercise.id === id)?.name ?? 'Unknown exercise'
  }

  return (
    <div className="mb-4 space-y-3">
      {inSections(day.slots).map((section, index) => {
        const folds = section.title === 'Warm-up'
        const open = !folds || warmupOpen
        const count = `${String(section.slots.length)} ${section.slots.length === 1 ? 'movement' : 'movements'}`

        const title = (
          <span className="text-ink-700 text-xs tracking-wide uppercase">{section.title}</span>
        )

        return (
          <div key={`${section.title}-${String(index)}`}>
            {folds ? (
              /*
               * The chevron sits on the right, with the count.
               *
               * Leading it would indent this heading past the four that
               * do not fold, and a ragged left edge across five headings
               * is a worse trade than a disclosure arrow in an
               * unconventional corner. The count is what earns the right
               * side here — folded, it is the only thing saying how much
               * is behind the tap.
               */
              <button
                type="button"
                aria-expanded={open}
                className="tap-target flex w-full items-center justify-between gap-2 text-left"
                onClick={() => {
                  setWarmupOpen(!warmupOpen)
                }}
              >
                {title}
                <span className="text-ink-700 flex items-center gap-1 text-xs">
                  {count}
                  {open ? (
                    <ChevronDown size={14} aria-hidden />
                  ) : (
                    <ChevronRight size={14} aria-hidden />
                  )}
                </span>
              </button>
            ) : (
              title
            )}

            {open && (
              <ul className="mt-1.5 space-y-1.5">
                {section.slots.map((slot) => (
                  <li key={slot.id} className="text-ink-300 flex justify-between gap-3 text-sm">
                    <span className="truncate">{nameOf(slot)}</span>
                    <span className="text-ink-500 numeric shrink-0">{describeSlot(slot.sets)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function describeSlot(sets: readonly SetPrescription[]): string {
  const first = sets.find((set) => set.isWarmup !== true) ?? sets[0]
  if (first === undefined) return '—'

  const label = describeReps(first.reps)
  if (sets.length === 1 && first.reps.kind === 'time') return label

  const count = countedSets(sets)

  // A deload caps the back-offs at one, and "1–1" is not a range.
  if (first.load.kind === 'rts-backoff' && count > 1) {
    return `1–${String(count)} × ${label}`
  }

  return `${String(count)} × ${label}`
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
