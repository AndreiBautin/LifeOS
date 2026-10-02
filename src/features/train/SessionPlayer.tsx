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
import { isEntryComplete, remainingSets, totalWorkingSets } from '@/domain/logging/workout-log'
import { describePrescription } from '@/domain/programs/prescription'
import { stepFor } from '@/domain/programs/progression'
import { slotRoleLabel, slotRoleTone, slotVariant } from '@/domain/programs/program'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { Badge, Button, Card } from '@/components/shared/primitives'
import { useKeepAwake } from '@/shared/hooks/useKeepAwake'
import { cn } from '@/lib/cn'

import { useClearSet, useLogSet } from './hooks'
import { LadderStrip } from './LadderStrip'
import { BarSection } from './BarSection'
import { RestTimer } from './RestTimer'
import { SetRow } from './SetRow'
import { WarmupBlock } from './WarmupBlock'

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
  const [index, setIndex] = useState(() => runStart(workout, firstIncompleteIndex(workout)))
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
  /*
   * A run of warm-up rows is one step: one card, one pill, and Next goes
   * past all of it. See `WarmupBlock`.
   */
  const warmup = warmupRun(workout, index)
  const stepEnd = warmup === undefined ? index : (warmup.at(-1) ?? index)
  const next = workout.entries[stepEnd + 1]
  const first = entry.sets[0]
  const stepComplete =
    warmup === undefined
      ? isEntryComplete(entry)
      : warmup.every((at) => {
          const one = workout.entries[at]
          return one === undefined || isEntryComplete(one)
        })

  const go = (to: number) => {
    setIndex(runStart(workout, Math.max(0, Math.min(workout.entries.length - 1, to))))
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
      {/*
        **Pinned to the very top, with its content padded below the status
        bar.** An installed app on a phone draws under the clock, so
        `top: 0` alone parked the bar's title row behind it — reported as
        the bar not sticking. Pulling the bar up over the page's own
        safe-area padding and padding its content back down means the
        background fills the strip behind the status bar too, so the sets
        never scroll through it. A style rather than a bracket class,
        because `env()` inside one is fragile across builds.
      */}
      <div
        className="bg-ink-950 border-ink-800/80 sticky top-0 z-20 -mx-4 mb-4 border-b px-4 pb-3 sm:mx-0 sm:rounded-b-2xl sm:border-x"
        style={{
          marginTop: 'calc(-1rem - var(--safe-top))',
          paddingTop: 'calc(0.75rem + var(--safe-top))',
        }}
      >
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
            const run = warmupRun(workout, candidateIndex)
            // A warm-up run is one pill, drawn at its first row.
            if (run !== undefined && run[0] !== candidateIndex) return null
            const complete =
              run === undefined
                ? isEntryComplete(candidate)
                : run.every((at) => {
                    const one = workout.entries[at]
                    return one === undefined || isEntryComplete(one)
                  })
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
                {run === undefined ? nameOf(candidate.exerciseId) : 'Warm-up'}
              </button>
            )
          })}
        </nav>
      </div>

      {warmup !== undefined ? (
        <WarmupBlock workout={workout} indices={warmup} nameOf={nameOf} />
      ) : (
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
          <BarSection
            key={index}
            equipment={exercises.find((one) => one.id === entry.exerciseId)?.equipment}
            load={loadToShow(entry.sets)}
            units={units}
            ramp={entry.role === 'strength'}
          />
          <LadderFor entry={entry} exercises={exercises} units={units} />

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
                earlier={entry.sets
                  .slice(0, setIndex)
                  .filter((one) => !one.isWarmup && one.outcome === 'completed')
                  .map((one) => ({ load: one.actualLoad, reps: one.actualReps }))}
                units={units}
                bodyweight={
                  exercises.find((one) => one.id === entry.exerciseId)?.loadBasis === 'bodyweight'
                }
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
      )}

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
            variant={stepComplete ? 'primary' : 'outline'}
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
          next={nextUp(workout, index, nameOf, exercises, units)}
          onDismiss={() => {
            setRestStartedAt(undefined)
          }}
        />
      )}
    </div>
  )
}

/**
 * The set the rest is leading up to, in the words the row will use: on
 * this exercise it is "Set 3", past it the exercise's name — with the
 * planned load and reps, so the bar can be loaded while the clock runs.
 */
function nextUp(
  workout: WorkoutLog,
  from: number,
  nameOf: (id: ExerciseId) => string,
  exercises: readonly Exercise[],
  units: WeightUnit,
): { readonly title: string; readonly detail: string } | undefined {
  for (let at = from; at < workout.entries.length; at += 1) {
    const entry = workout.entries[at]
    if (entry === undefined) continue
    const setIndex = entry.sets.findIndex((set) => set.outcome === 'pending')
    const set = entry.sets[setIndex]
    if (set === undefined) continue
    const bodyweight =
      exercises.find((one) => one.id === entry.exerciseId)?.loadBasis === 'bodyweight'
    const load =
      set.plannedLoad === undefined
        ? undefined
        : bodyweight
          ? set.plannedLoad > 0
            ? `BW + ${formatLoad(set.plannedLoad, units)}`
            : 'BW'
          : formatLoad(set.plannedLoad, units)
    return {
      title: at === from ? `Set ${String(setIndex + 1)}` : nameOf(entry.exerciseId),
      detail:
        load === undefined || set.plannedReps === undefined
          ? describePrescription(set.prescription)
          : `${load} × ${String(set.plannedReps)}`,
    }
  }
  return undefined
}

/** The indices of the warm-up run `at` sits in, or undefined if it is not a warm-up. */
function warmupRun(workout: WorkoutLog, at: number): readonly number[] | undefined {
  const isWarmup = (i: number) => workout.entries[i]?.role === 'warmup'
  if (!isWarmup(at)) return undefined
  let start = at
  while (isWarmup(start - 1)) start -= 1
  let end = at
  while (isWarmup(end + 1)) end += 1
  return Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
}

function runStart(workout: WorkoutLog, at: number): number {
  return warmupRun(workout, at)?.[0] ?? at
}

/**
 * The weight the bar should hold now: the next pending set's planned load,
 * or, once every set is settled, the last one actually lifted — so the
 * picture still answers "what is on the bar" while you strip it.
 */
function loadToShow(sets: WorkoutLog['entries'][number]['sets']): number | undefined {
  const pending = sets.find((set) => set.outcome === 'pending' && !set.isWarmup)
  if (pending !== undefined) return pending.plannedLoad
  return [...sets].reverse().find((set) => set.actualLoad !== undefined)?.actualLoad
}

/**
 * The progression ladder, for an exercise worked in a rep range — not a
 * timed block or a warm-up, where there is no top of a range to reach.
 */
function LadderFor({
  entry,
  exercises,
  units,
}: {
  readonly entry: WorkoutLog['entries'][number]
  readonly exercises: readonly Exercise[]
  readonly units: WeightUnit
}) {
  const reps = entry.sets.find((set) => !set.isWarmup)?.prescription.reps
  const exercise = exercises.find((one) => one.id === entry.exerciseId)
  if (reps?.kind !== 'range' || exercise === undefined) return null
  return (
    <LadderStrip
      sets={entry.sets}
      range={{ low: reps.low, high: reps.high }}
      step={stepFor(exercise)}
      units={units}
      bodyweight={exercise.loadBasis === 'bodyweight'}
    />
  )
}

function firstIncompleteIndex(workout: WorkoutLog): number {
  const found = workout.entries.findIndex((entry) => !isEntryComplete(entry))
  return found === -1 ? 0 : found
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
