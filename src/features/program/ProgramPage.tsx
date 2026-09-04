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
   * **One week is drawn, and it is the working one.**
   *
   * This screen has been a tab strip of six, then two, and is now none.
   * Each cut had the same cause arriving further along: every working
   * week is identical by construction — `weeklyTargetForWeek` returns
   * the same target for all of them — so a control offering a choice
   * between them was offering one thing under several names.
   *
   * The last pair looked like a real choice and was not, reported as
   * _"the whole what week are you on and working week/Deload button
   * feels overkill considering it's just identical working weeks and a
   * slight drop of load and volume on deloads."_ Right: a deload is the
   * same session list at a lower level, so drawing it is drawing this
   * page again with smaller numbers. **What it is, is worth a sentence;
   * it was never worth a tab**, and a tab is what made it look like a
   * second programme to study rather than a lighter week of this one.
   *
   * **What is drawn is the week you are on**, which is what makes the
   * control removable rather than merely hidden. Defaulting to the
   * working week instead was tried and is wrong for the one week in
   * seven that differs: it would show a full session list to somebody
   * whose actual week is the light one, which is worse than the tab was.
   *
   * The header still says which week that is, because counting down to
   * the deload is the whole reason to know it.
   */
  const week = weeks[currentWeek] ?? weeks[0]

  const library = exercises.data ?? []
  const lookup = (id: ExerciseId): Exercise | undefined =>
    library.find((exercise) => exercise.id === id)

  const targets = explainVolume()
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
        **The week you are on is the control, rather than a sentence with
        a picker underneath it.** Asked for as _"we already have the 'on
        week 5' under program, let's just make that editable and drop the
        section underneath it."_ Right: the line already named the week
        and a section below then asked the same question again, so the
        page stated a fact and offered a way to change it in two places a
        screen apart.

        Saying it in words is what made the picker removable — the answer
        is legible whether or not anybody touches it, which is the reading
        a tinted tab could never give. It only ever needed to be the same
        object.

        It wraps rather than sharing a fixed row: a select takes its
        intrinsic width from its longest option, and this file's own
        record of three controls on one row at 375 is what that costs.
      */}
      <PageHeader
        title="Program"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>
              {weeks.length} weeks · {week.days.length} days a week · on
            </span>
            <select
              aria-label="Which week are you on"
              className="border-ink-800 bg-ink-850 text-ink-300 tap-target focus-visible:border-accent-500 rounded-lg border px-2 text-sm font-medium"
              value={currentWeek}
              disabled={jumpToWeek.isPending}
              onChange={(event) => {
                jumpToWeek.mutate({
                  program: program.data,
                  weekIndex: Number(event.target.value),
                })
              }}
            >
              {weeks.map((candidate, index) => (
                <option key={candidate.index} value={index}>
                  {candidate.isDeload ? 'the deload' : `week ${String(index + 1)}`}
                </option>
              ))}
            </select>
          </span>
        }
      />

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
