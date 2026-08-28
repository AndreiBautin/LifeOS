import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'

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

  const [deloadView, setDeloadView] = useState<boolean | undefined>(undefined)
  const [openMuscle, setOpenMuscle] = useState<string | undefined>(undefined)

  const block = program.data?.blocks[0]
  const weeks = block?.weeks ?? []

  /*
   * The week the lifter is on, whether or not one has been recorded yet.
   *
   * A position is only written once a session is started, skipped or
   * jumped to, so a fresh install has none — and gating on
   * `position.data` being present meant the jump control was hidden from
   * exactly the person who needs it. Someone arriving three weeks into a
   * block, on a device that has never opened a session, had no way to say
   * so: no dot on any tab, and no "start from here" however far they
   * browsed. Week one by default is the right *reading* of an absent
   * position; it must not also be an unchangeable one.
   */
  const currentWeek = position.data?.weekIndex ?? 0

  /*
   * Two views, not one per week.
   *
   * Volume is flat across the working weeks now, so they are byte
   * identical — a tab strip of six was six ways to look at the same
   * screen, and the one difference that matters, the deload, was the
   * seventh tab where nobody looked for it.
   *
   * The week you are *on* still matters and has not moved: it is on the
   * header, because counting down to the deload is the reason to know
   * it.
   */
  const deloadIndex = weeks.findIndex((candidate) => candidate.isDeload)
  const workingIndex = weeks.findIndex((candidate) => !candidate.isDeload)

  const showingDeload = deloadView ?? weeks[currentWeek]?.isDeload ?? false
  const current = showingDeload ? deloadIndex : workingIndex
  const week = weeks[Math.max(0, current)]

  const library = exercises.data ?? []
  const lookup = (id: ExerciseId): Exercise | undefined =>
    library.find((exercise) => exercise.id === id)

  const targets = explainVolume(
    settings.muscleVolumes,
    settings.setsPerSession,
    settings.liftSessions,
  )
  const attribution = week === undefined ? [] : attributeWeek(week, lookup)

  if (program.data === undefined || week === undefined) {
    return (
      <div>
        <PageHeader title="Program" />
        <Card>
          <p className="text-ink-300 text-sm">Building the block…</p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      {/*
        The week you are on, spelled out.

        It was inferable only from which tab was tinted, which is a lot of
        weight for a border colour to carry — and useless for answering
        the question people actually ask, which is "does this app know
        where I am". Saying it in words also makes it obvious when the
        answer is wrong, and therefore that there is something to change.
      */}
      <PageHeader
        title="Program"
        subtitle={
          <>
            {weeks.length} weeks · {week.days.length} days a week · on{' '}
            <span className="text-ink-300">
              {weeks[currentWeek]?.isDeload === true
                ? 'the deload'
                : `week ${String(currentWeek + 1)}`}
            </span>
          </>
        }
      />

      <div className="mb-5 flex gap-1.5" role="tablist" aria-label="Week">
        {[
          { label: 'Working week', deload: false },
          { label: 'Deload', deload: true },
        ].map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={tab.deload === showingDeload}
            onClick={() => {
              setDeloadView(tab.deload)
            }}
            className={cn(
              'tap-target flex-1 rounded-lg border px-3 text-xs font-semibold transition-colors',
              tab.deload === showingDeload
                ? 'border-accent-500 bg-accent-500 text-black'
                : 'border-ink-800 bg-ink-850 text-ink-500 hover:border-ink-700',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/*
        The way to say "I am already three weeks into this".

        The position otherwise only moves by finishing or skipping a
        session, which is right — it records what happened rather than
        what a calendar says. But a lifter arriving mid-block would have
        to skip their way to the right week, and until they did the app
        would be counting the block from the wrong place.

        This used to hang off the week tabs: browse to week three, press
        "start from here". With the tabs down to two that reading is
        gone — a tab now says *what kind of week*, not which one — so the
        week has to be pickable in its own right. It is the only reason
        the week number is still a number the lifter touches.
      */}
      <Section
        title="Which week are you on?"
        description="Only the deload differs; this is what the app counts down from."
      >
        <div className="flex flex-wrap gap-1.5">
          {weeks.map((candidate, index) => (
            <button
              key={candidate.index}
              type="button"
              aria-pressed={index === currentWeek}
              onClick={() => {
                jumpToWeek.mutate({ program: program.data, weekIndex: index })
              }}
              disabled={jumpToWeek.isPending}
              className={cn(
                'tap-target numeric min-w-11 rounded-lg border px-3 text-xs font-semibold transition-colors',
                index === currentWeek
                  ? 'border-accent-500 text-accent-400 bg-accent-500/10'
                  : 'border-ink-800 bg-ink-850 text-ink-500 hover:border-ink-700',
              )}
            >
              {candidate.isDeload ? 'Deload' : index + 1}
            </button>
          ))}
        </div>
      </Section>

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
            Hypertrophy work only, and a set counts once for the muscle it is programmed for. The
            competition lifting and the conditioning are not counted here — they are training, not
            volume toward these numbers — and a bench press is chest rather than part triceps, so
            the triceps get their own slot instead of credit for the pressing.
          </p>

          <ul className="space-y-1">
            {attribution
              .filter(
                (entry) =>
                  entry.total > 0 ||
                  (targets.muscles.find((muscle) => muscle.muscle === entry.muscle)?.weeklySets ??
                    0) > 0,
              )
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
   *   5 × 235 lb  ·  5% drop, stop at RPE 8.5  ·  1–3 sets
   *
   * Written as a range rather than as "cap 3" so that this page and the
   * Train page say the same thing about the same block. "Cap" is accurate
   * and is a word about the *model*; "1–3" is a word about the session,
   * and the session is what a lifter is reading for.
   */
  const load = shown[0]?.prescription.load
  const backoff = load?.kind === 'rts-backoff' ? load : undefined

  const line =
    backoff !== undefined
      ? [
          `${describeReps(shown[0]?.reps ?? { kind: 'fixed', reps: 0 })} × ${shown[0]?.loadDisplay ?? '—'}`,
          `${String(backoff.dropPercent)}% drop${backoff.stopRpe === undefined ? '' : `, stop at RPE ${String(backoff.stopRpe)}`}`,
          shown.length > 1 ? `1–${String(shown.length)} sets` : '1 set',
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
   * Over target is worth showing, not only under — a slot sized to a
   * remainder can round up past the ask, and a screen that only
   * colours shortfalls makes that invisible.
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
