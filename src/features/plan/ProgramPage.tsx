import { useState } from 'react'

import { useSettings } from '@/app/context'
import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import type { Slot } from '@/domain/programs/program'
import { slotRoleLabel, slotRoleTone, slotVariant } from '@/domain/programs/program'
import { describeReps } from '@/domain/programs/prescription'
import { resolveSets } from '@/domain/resolution/resolve'
import { attributeWeek, type MuscleAttribution } from '@/domain/volume/attribution'
import { explainVolume } from '@/domain/priority/explain'
import { Badge, Button, Card, Section } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

import { useExercises, useJumpToWeek, usePosition, useProgram } from '@/features/train/hooks'

/**
 * The whole block, laid out, with the numbers it would actually give you.
 *
 * The Train screen answers "what am I doing now" and deliberately shows
 * nothing else. This answers the other question — what does the next six
 * weeks look like, and is it sensible — which a lifter asks once at the
 * start of a block and then rarely again, but cannot train confidently
 * without.
 *
 * Loads are resolved here rather than left as prescriptions, because
 * "3–6 @ RPE 9" is not something you can sanity-check against your own
 * training. "125 lb" is.
 */
export function ProgramPage() {
  const { settings, athlete } = useSettings()
  const program = useProgram()
  const position = usePosition()
  const exercises = useExercises()
  const jumpToWeek = useJumpToWeek()

  const [weekIndex, setWeekIndex] = useState<number | undefined>(undefined)
  const [openMuscle, setOpenMuscle] = useState<string | undefined>(undefined)

  const block = program.data?.blocks[0]
  const weeks = block?.weeks ?? []

  // Opens on the week the lifter is actually in, not on week one.
  const here = position.data ?? undefined
  const current = weekIndex ?? here?.weekIndex ?? 0
  const week = weeks[Math.min(current, Math.max(0, weeks.length - 1))]

  const library = exercises.data ?? []
  const lookup = (id: ExerciseId): Exercise | undefined =>
    library.find((exercise) => exercise.id === id)

  const targets = explainVolume(settings.muscleTiers, settings.strengthTiers, settings.landmarks)
  const attribution = week === undefined ? [] : attributeWeek(week, lookup)

  if (program.data === undefined || week === undefined) {
    return (
      <div>
        <header className="mb-6">
          <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Program</h1>
        </header>
        <Card>
          <p className="text-ink-300 text-sm">Building the block…</p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Program</h1>
        <p className="text-ink-500 mt-0.5 text-sm">
          {weeks.length} weeks · {week.days.length} days a week
        </p>
      </header>

      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Week">
        {weeks.map((candidate, index) => {
          const label = candidate.isDeload ? 'Deload' : `Wk ${String(index + 1)}`
          /*
           * Two different things were both signalled by "this tab is
           * highlighted": the week being *looked at* and the week being
           * *trained*. They are the same until you tap another tab, and
           * then there is no way to tell where you actually are — which
           * makes a page opened on week three indistinguishable from one
           * opened on week one and browsed forward.
           */
          const isHere = index === here?.weekIndex

          return (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={index === current}
              aria-label={isHere ? `${label}, the week you are on` : label}
              onClick={() => {
                setWeekIndex(index)
              }}
              className={cn(
                'tap-target flex shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors',
                index === current
                  ? 'border-accent-500 bg-accent-500 text-black'
                  : isHere
                    ? 'border-accent-500/50 bg-ink-850 text-ink-100'
                    : 'border-ink-800 bg-ink-850 text-ink-500 hover:border-ink-700',
              )}
            >
              {label}
              {isHere && (
                <span
                  aria-hidden
                  className={cn(
                    'size-1.5 rounded-full',
                    index === current ? 'bg-black/50' : 'bg-accent-500',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>

      {/*
        The way to say "I am already three weeks into this".

        The position otherwise only moves by finishing or skipping a
        session, which is right — it records what happened rather than
        what a calendar says. But a lifter arriving mid-block would have
        to skip their way to the right week, and until they did the app
        would be counting the block from the wrong place.
      */}
      {here !== undefined && current !== here.weekIndex && (
        <Card className="mb-5 flex items-center justify-between gap-3">
          <p className="text-ink-500 text-xs">
            You are on{' '}
            {weeks[here.weekIndex]?.isDeload === true
              ? 'the deload'
              : `week ${String(here.weekIndex + 1)}`}
            .
          </p>
          <Button
            variant="outline"
            onClick={() => {
              jumpToWeek.mutate({ program: program.data, weekIndex: current })
            }}
            disabled={jumpToWeek.isPending}
          >
            Start from here
          </Button>
        </Card>
      )}

      {week.days.map((day) => (
        <Section
          key={day.index}
          title={day.label}
          {...(day.focus ? { description: day.focus } : {})}
        >
          <Card className="space-y-2">
            {day.slots.map((slot) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                exercise={
                  slot.exercise.kind === 'specific' ? lookup(slot.exercise.exerciseId) : undefined
                }
                athlete={athlete}
                roundingIncrement={settings.roundingIncrement}
              />
            ))}
          </Card>
        </Section>
      ))}

      <Section
        title="Where the volume comes from"
        description="Every set counted toward each muscle this week, and what produced it"
      >
        <Card>
          <p className="text-ink-500 mb-3 text-xs">
            An exercise counts one set to the muscle it trains directly and half a set to each
            muscle it trains indirectly. That is why a chest total can land on a half, and why the
            pressing you do for triceps shows up under chest as well.
          </p>

          <ul className="space-y-1">
            {attribution
              .filter((entry) => entry.total > 0)
              .sort((a, b) => b.total - a.total)
              .map((entry) => (
                <AttributionRow
                  key={entry.muscle}
                  entry={entry}
                  target={
                    targets.muscles.find((muscle) => muscle.muscle === entry.muscle)?.weeklySets ??
                    0
                  }
                  isOpen={openMuscle === entry.muscle}
                  onToggle={() => {
                    setOpenMuscle(openMuscle === entry.muscle ? undefined : entry.muscle)
                  }}
                />
              ))}
          </ul>
        </Card>
      </Section>
    </div>
  )
}

function SlotRow({
  slot,
  exercise,
  athlete,
  roundingIncrement,
}: {
  readonly slot: Slot
  readonly exercise: Exercise | undefined
  readonly athlete: Parameters<typeof resolveSets>[1]['athlete']
  readonly roundingIncrement: number
}) {
  const resolved =
    exercise === undefined
      ? []
      : resolveSets(slot.sets, { athlete, exerciseId: exercise.id, roundingIncrement })

  const working = resolved.filter((set) => !set.isWarmup)
  const shown = working.length > 0 ? working : resolved

  /*
   * Identical sets collapse to one row, and reps come before the load.
   *
   * Written load-first it read "2 × 125 lb @ RPE 9 × 3–6" — two
   * multiplication signs meaning different things in one line, which is
   * the sort of thing you have to decode rather than read. A timed set
   * drops the count entirely: "1 × 20 min" invites the reader to work out
   * what one of a twenty-minute walk is.
   */
  const grouped = shown.reduce<{ label: string; count: number }[]>((rows, set) => {
    const parts = [describeReps(set.reps)]
    if (set.loadDisplay !== '—' && set.reps.kind !== 'time') parts.push(set.loadDisplay)

    const label = parts.join(' · ')
    const last = rows[rows.length - 1]

    if (last?.label === label) last.count += 1
    else rows.push({ label, count: 1 })

    return rows
  }, [])

  /*
   * A back-off block is written as the instruction it actually is.
   *
   * "3 × 5 · 235 lb" is the shape of a fixed prescription and says none
   * of the three things that make this an RTS block: that the bar stays
   * where it is, that the RPE is the reading rather than the
   * instruction, and that the count is a cap you will usually not reach.
   * A lifter who grinds out all three because the page said three has
   * had the stopping rule taken away from them.
   *
   *   5 × 235 lb  ·  5% drop, stop at RPE 8.5  ·  cap 3
   */
  const load = shown[0]?.prescription.load
  const backoff = load?.kind === 'rts-backoff' ? load : undefined

  const line =
    backoff !== undefined
      ? [
          `${describeReps(shown[0]?.reps ?? { kind: 'fixed', reps: 0 })} × ${shown[0]?.loadDisplay ?? '—'}`,
          `${String(backoff.dropPercent)}% drop${backoff.stopRpe === undefined ? '' : `, stop at RPE ${String(backoff.stopRpe)}`}`,
          `cap ${String(shown.length)}`,
        ].join('  ·  ')
      : grouped
          .map((row) =>
            row.count === 1 && shown[0]?.reps.kind === 'time'
              ? row.label
              : `${String(row.count)} × ${row.label}`,
          )
          .join('  ·  ')

  return (
    <div className="border-ink-800 flex items-start justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-ink-50 truncate text-sm font-medium">
          {exercise?.name ??
            (slot.exercise.kind === 'query' ? slot.exercise.label : 'Unknown exercise')}
        </p>
        <p className="text-ink-500 numeric mt-0.5 text-xs">{line}</p>
      </div>
      {/*
        Bucket first, sub-category second. Compound and isolation are two
        ways of doing hypertrophy, not two kinds of work.
      */}
      <span className="flex shrink-0 items-center gap-1.5">
        <Badge tone={slotRoleTone(slot.role)}>{slotRoleLabel(slot.role)}</Badge>
        {slotVariant(slot) !== '' && <Badge tone="sub">{slotVariant(slot)}</Badge>}
      </span>
    </div>
  )
}

function AttributionRow({
  entry,
  target,
  isOpen,
  onToggle,
}: {
  readonly entry: MuscleAttribution
  readonly target: number
  readonly isOpen: boolean
  readonly onToggle: () => void
}) {
  /*
   * Over target is worth showing, not only under.
   *
   * A maintained muscle routinely runs *above* its target because the
   * competition lifts pay it whether or not it was asked for — squats and
   * deadlifts alone put the quads and glutes well past what maintenance
   * asks. That is not a fault, it is the reason those muscles need no
   * dedicated work, and it is invisible if only shortfalls are coloured.
   */
  const short = target > 0 && entry.total < target - 0.5
  const over = target > 0 && entry.total > target + 0.5

  return (
    <li>
      <Button variant="ghost" full onClick={onToggle} className="justify-between px-2">
        <span className="text-ink-300 text-sm">{entry.label}</span>
        <span className="numeric text-sm">
          <span className={short ? 'text-warn-500' : over ? 'text-good-500' : 'text-ink-50'}>
            {entry.total}
          </span>
          <span className="text-ink-500"> / {target}</span>
        </span>
      </Button>

      {isOpen && (
        <ul className="border-ink-800 mt-1 mb-2 ml-2 space-y-1 border-l pl-3">
          {entry.contributions.map((contribution) => (
            <li
              key={`${contribution.exerciseId}-${contribution.role}`}
              className="flex items-baseline justify-between gap-3 text-xs"
            >
              <span className="text-ink-300 min-w-0 truncate">
                {contribution.name}
                {contribution.kind === 'secondary' && (
                  <span className="text-ink-500"> — indirect</span>
                )}
              </span>
              <span className="numeric text-ink-500 shrink-0">
                {contribution.sets} set{contribution.sets === 1 ? '' : 's'} →{' '}
                <span className="text-ink-100">{contribution.counted}</span>
              </span>
            </li>
          ))}
          {entry.contributions.length === 0 && (
            <li className="text-ink-500 text-xs">Nothing trains this muscle in this week.</li>
          )}
        </ul>
      )}
    </li>
  )
}
