import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Timer,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useServices } from '@/app/context'

import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import {
  isEntryComplete,
  loggedVolume,
  remainingSets,
  totalWorkingSets,
} from '@/domain/logging/workout-log'
import { describePrescription } from '@/domain/programs/prescription'
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
  const strip = useRef<HTMLElement>(null)

  /*
   * The strip follows the session. Scrolled by hand rather than with
   * `scrollIntoView`, which also scrolls the page — and the page is
   * already where the lifter wants it.
   */
  useEffect(() => {
    const nav = strip.current
    const pill = nav?.querySelector<HTMLElement>(`[data-entry="${String(index)}"]`)
    if (nav == null || pill == null) return
    nav.scrollTo({
      left: pill.offsetLeft - nav.clientWidth / 2 + pill.clientWidth / 2,
      behavior: 'smooth',
    })
  }, [index])
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

  const totalSets = workout.entries.reduce((sum, candidate) => sum + candidate.sets.length, 0)
  const settled = totalSets - outstanding
  const next = workout.entries[index + 1]
  const first = entry.sets[0]

  const go = (to: number) => {
    setIndex(Math.max(0, Math.min(workout.entries.length - 1, to)))
    setOpenSet(undefined)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto max-w-2xl pb-28">
      {/*
        **The session's own bar, pinned while the sets scroll.** The page
        used to open on the exercise name with "Exercise 6 of 8" in grey
        under it, so where the session stood — how far through, how long
        it had run — was something to work out. The bar answers both, and
        stays put while a long exercise scrolls.
      */}
      <div className="bg-ink-950/90 border-ink-800/80 sticky top-0 z-20 -mx-4 mb-4 border-b px-4 pt-3 pb-3 sm:mx-0 sm:rounded-b-2xl sm:border-x">
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-300 min-w-0 truncate text-sm font-medium">{workout.title}</p>
          <p className="numeric text-ink-500 flex shrink-0 items-center gap-3 text-xs">
            <span>
              <span className="text-ink-50 font-semibold">{settled}</span>/{totalSets} sets
            </span>
            <Elapsed startedAt={workout.startedAt} />
          </p>
        </div>
        <div className="bg-ink-800 mt-2 h-1 overflow-hidden rounded-full" aria-hidden>
          <div
            className="from-accent-600 to-accent-400 h-full rounded-full bg-gradient-to-r transition-[width] duration-500"
            style={{
              width: `${String(totalSets === 0 ? 0 : Math.round((settled / totalSets) * 100))}%`,
            }}
          />
        </div>

        {/*
          The exercises by name, done ones ticked. It replaced a row of
          unlabelled dashes, which said where you were and nothing about
          what any of the other positions held.
        */}
        <nav
          ref={strip}
          aria-label="Exercises"
          className="relative -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]"
        >
          {workout.entries.map((candidate, candidateIndex) => {
            const complete = isEntryComplete(candidate)
            const current = candidateIndex === index
            return (
              <button
                key={candidateIndex}
                type="button"
                data-entry={candidateIndex}
                aria-current={current ? 'step' : undefined}
                onClick={() => {
                  go(candidateIndex)
                }}
                className={cn(
                  'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
                  current
                    ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                    : complete
                      ? 'border-good-500/25 text-good-500'
                      : 'border-ink-800 text-ink-500 hover:text-ink-300',
                )}
              >
                {complete && !current && <Check size={12} aria-hidden />}
                {nameOf(candidate.exerciseId)}
              </button>
            )
          })}
        </nav>
      </div>

      <section className="card p-4 lg:p-6" aria-labelledby="exercise-name">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Badge tone={slotRoleTone(entry.role)}>{slotRoleLabel(entry.role)}</Badge>
          {slotVariant(entry) !== '' && <Badge tone="sub">{slotVariant(entry)}</Badge>}
          <span className="text-ink-500 ml-auto text-xs">
            {index + 1} of {workout.entries.length}
          </span>
        </div>
        <h1
          id="exercise-name"
          className="text-ink-50 text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {nameOf(entry.exerciseId)}
        </h1>
        {first !== undefined && (
          <p className="text-ink-500 numeric mt-1 text-sm">
            {entry.sets.length} {entry.sets.length === 1 ? 'set' : 'sets'} ·{' '}
            {describePrescription(first.prescription)}
          </p>
        )}

        <div className="mt-4 space-y-2">
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
          <p className="border-ink-800 text-ink-300 mt-4 flex gap-2 border-t pt-3 text-sm">
            <Lightbulb size={16} className="text-accent-400 mt-0.5 shrink-0" aria-hidden />
            <span>{entry.notes}</span>
          </p>
        )}
      </section>

      <VolumeTally workout={workout} exercises={exercises} />

      {/*
        **Next is named, and it lights once this exercise is done.** Paging
        was a pair of chevrons either side of the dashes; "Up next · Dips"
        says where the button goes, which is the question a lifter
        re-racking a bar is actually asking.
      */}
      <div className="mt-5 flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            go(index - 1)
          }}
          disabled={index === 0}
          aria-label="Previous exercise"
        >
          <ChevronLeft size={18} aria-hidden />
        </Button>
        {next !== undefined ? (
          <Button
            variant={isEntryComplete(entry) ? 'primary' : 'outline'}
            className="min-w-0 flex-1 justify-between"
            onClick={() => {
              go(index + 1)
            }}
            aria-label={`Next exercise: ${nameOf(next.exerciseId)}`}
          >
            <span className="min-w-0 truncate">
              <span className="font-normal opacity-60">Up next · </span>
              {nameOf(next.exerciseId)}
            </span>
            <ChevronRight size={18} aria-hidden />
          </Button>
        ) : (
          <p className="text-ink-500 flex-1 text-center text-sm">Last exercise</p>
        )}
      </div>

      {/*
        **Finishing is quiet until there is nothing left.** It was a lit,
        full-width "Finish (20 sets unlogged)" from the first set — the
        loudest control on the screen was the one that ends the session
        early. It turns primary once every set is logged or skipped.
      */}
      <Button
        variant={outstanding === 0 ? 'primary' : 'ghost'}
        size={outstanding === 0 ? 'lg' : 'md'}
        full
        className="mt-6"
        onClick={onFinish}
      >
        <CheckCircle2 size={outstanding === 0 ? 20 : 16} aria-hidden />
        {outstanding === 0 ? 'Finish session' : `Finish early · ${String(outstanding)} sets left`}
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
 * How much of the day's target has been done, as one pip per set.
 *
 * The plan cannot know in advance whether every set will be done, so the
 * session says where it stands and the lifter decides — two more sets of
 * dips, or not, but knowingly. Counted by `loggedVolume`, which is what
 * the planner uses on the other side of the comparison; a tally measured
 * by different rules from the target beside it would be worse than none.
 *
 * **Pips, not bars.** It was three thin progress bars the width of the
 * screen — the shape the weekly volume was replaced for. A target here is
 * a handful of sets, and a row of five pips with two lit is countable at
 * a glance where a bar two-fifths full is an estimate.
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

  const met = rows.every((row) => row.remaining === 0)

  return (
    <div className="card mt-4 p-4 lg:p-6">
      <p className="text-ink-500 mb-3 text-xs font-medium tracking-wide uppercase">
        {met ? 'Every target hit' : 'Today’s targets'}
      </p>
      <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {rows.map((row) => {
          const pips = Math.max(row.target, Math.ceil(row.done))
          const reached = row.remaining === 0
          return (
            <li key={row.muscle} className="flex items-center justify-between gap-3">
              <span className="text-ink-300 text-sm">{MUSCLE_GROUP_LABELS[row.muscle]}</span>
              <span className="flex items-center gap-2">
                <span className="flex gap-1" aria-hidden>
                  {Array.from({ length: pips }, (_, pip) => (
                    <span
                      key={pip}
                      className={cn(
                        'size-2.5 rounded-full',
                        pip < Math.floor(row.done)
                          ? reached
                            ? 'bg-good-500'
                            : 'bg-accent-400'
                          : pip < row.done
                            ? 'bg-accent-400/50'
                            : 'bg-ink-800',
                      )}
                    />
                  ))}
                </span>
                <span
                  className={cn(
                    'numeric w-9 text-right text-xs',
                    reached ? 'text-good-500' : 'text-ink-500',
                  )}
                >
                  {row.done}/{row.target}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * How long the session has run, read from the clock port.
 *
 * Derived from `startedAt` on every tick rather than counted up, for the
 * reason the rest timer is: a phone locked between sets suspends the tab,
 * and a count would come back short.
 */
function Elapsed({ startedAt }: { readonly startedAt: string }) {
  const { clock } = useServices()
  const [now, setNow] = useState(() => clock.now().getTime())

  useEffect(() => {
    const tick = (): void => {
      setNow(clock.now().getTime())
    }
    const handle = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(handle)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [clock])

  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const text =
    hours > 0
      ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
      : `${String(minutes)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <span className="flex items-center gap-1" aria-label={`${text} elapsed`}>
      <Timer size={12} aria-hidden />
      {text}
    </span>
  )
}
