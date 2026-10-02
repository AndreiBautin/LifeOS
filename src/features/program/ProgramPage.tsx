import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'

import { useServices, useSettings } from '@/app/context'
import { cn } from '@/lib/cn'
import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import type { ProgramDay, Slot } from '@/domain/programs/program'
import { inSections, scheduledVolume } from '@/domain/programs/program'
import { describeReps } from '@/domain/programs/prescription'
import { resolveSets } from '@/domain/resolution/resolve'
import { attributeWeek, type MuscleAttribution } from '@/domain/volume/attribution'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { Badge, Button, Card, CardHeading } from '@/components/shared/primitives'

import { useExercises, useJumpToWeek, useProgram } from '@/features/train/hooks'
import { splitDayLabel, useNextSession } from '@/features/train/useNextSession'

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
  const { clock } = useServices()
  const todayWeekday = clock.now().getDay()
  const program = useProgram()
  const { thisWeek } = useNextSession()
  const exercises = useExercises()
  const jumpToWeek = useJumpToWeek()

  const [openMuscle, setOpenMuscle] = useState<string | undefined>(undefined)

  const block = program.data?.blocks[0]
  const weeks = block?.weeks ?? []

  /*
   * The week the calendar puts today in — whole weeks since the block's
   * Monday, so it reads correctly on a device that has never opened a
   * session. Choosing another writes a new Monday; see `jumpToWeek`.
   */
  const currentWeek = thisWeek === undefined ? 0 : Math.max(0, weeks.indexOf(thisWeek))

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

  // What the routine actually schedules — see `scheduledVolume`.
  const scheduled = week === undefined ? {} : scheduledVolume(week)
  const targetOf = (muscle: MuscleGroup): number => scheduled[muscle] ?? 0
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
                  {/*
                    **The option is a name, not the tail of the
                    sentence.** It read "the deload" so that "on the
                    deload" scanned — and a menu is a list of things
                    rather than a sentence, so the article read as a typo
                    once the list was open. The sentence loses a word;
                    the list stops looking wrong.
                  */}
                  {candidate.isDeload ? 'Deload' : `Week ${String(index + 1)}`}
                </option>
              ))}
            </select>
          </span>
        }
      />

      {/*
        **A strip of the week, then a card per day.** The page was six
        sections of flat rows, a third of them warm-ups and every row
        carrying two badges — on a phone it scrolled for a long time
        before saying anything, and the badges truncated the names they
        sat beside. The strip answers "what is on which day" at a glance
        and jumps to it; each card groups its rows the way the session
        plan does, so the heading says what kind of work a row is and the
        row can spend its width on the name and the numbers.
      */}
      <nav aria-label="Days" className="mb-5">
        <ol
          className="grid gap-1.5 sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${String(week.days.length)}, minmax(0, 1fr))` }}
        >
          {week.days.map((day) => {
            const label = splitDayLabel(day.label)
            const isToday = day.weekday === todayWeekday
            return (
              <li key={day.index} className="min-w-0">
                <a
                  href={`#day-${String(day.index)}`}
                  aria-current={isToday ? 'date' : undefined}
                  className={cn(
                    'tap-target flex flex-col items-center rounded-xl border px-1 py-2 text-center transition-colors',
                    isToday
                      ? 'border-accent-500/60 bg-accent-500/10 text-ink-50'
                      : 'border-ink-800 bg-ink-900/60 text-ink-300 hover:border-ink-700',
                  )}
                  onClick={(event) => {
                    event.preventDefault()
                    document
                      .getElementById(`day-${String(day.index)}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  <span
                    className={cn(
                      'text-[0.65rem] font-semibold tracking-[0.12em] uppercase',
                      isToday ? 'text-accent-400' : 'text-ink-500',
                    )}
                  >
                    {(label.weekday ?? '').slice(0, 3) || `Day ${String(day.index + 1)}`}
                  </span>
                  <span className="w-full truncate text-xs font-medium sm:text-sm">
                    {label.name}
                  </span>
                </a>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        {week.days.map((day) => (
          <DayCard
            key={day.index}
            day={day}
            isToday={day.weekday === todayWeekday}
            lookup={lookup}
            athlete={athlete}
            roundingIncrement={settings.roundingIncrement}
          />
        ))}
      </div>

      <Card className="mt-4">
        <CardHeading icon={<BarChart3 size={16} aria-hidden />} title="Sets per muscle" />
        <p className="text-ink-500 mb-3 text-xs">
          Accessory sets this week, each counted once for the muscle it is programmed for. Tap a
          muscle to see what feeds it.
        </p>

        <ul className="space-y-1">
          {attribution
            .filter((entry) => entry.total > 0 || targetOf(entry.muscle) > 0)
            .sort((a, b) => b.total - a.total)
            .map((entry) => (
              <AttributionRow
                key={entry.muscle}
                entry={entry}
                target={targetOf(entry.muscle)}
                isOpen={openMuscle === entry.muscle}
                onToggle={() => {
                  setOpenMuscle(openMuscle === entry.muscle ? undefined : entry.muscle)
                }}
              />
            ))}
        </ul>
      </Card>
    </div>
  )
}

/**
 * One day of the week: its name, what it trains, and the session in the
 * parts it is run in.
 *
 * The warm-up folds, for the reason it folds on the session plan: it is
 * the same every time and asks for no decision, and it was a third of
 * every day on this page. Today's card is lit, so the week reads against
 * the calendar rather than as a list.
 */
function DayCard({
  day,
  isToday,
  lookup,
  athlete,
  roundingIncrement,
}: {
  readonly day: ProgramDay
  readonly isToday: boolean
  readonly lookup: (id: ExerciseId) => Exercise | undefined
  readonly athlete: Parameters<typeof resolveSets>[1]['athlete']
  readonly roundingIncrement: number
}) {
  const [warmupOpen, setWarmupOpen] = useState(false)
  const label = splitDayLabel(day.label)
  const working = day.slots.filter((slot) => slot.role !== 'warmup').length

  return (
    <Card
      id={`day-${String(day.index)}`}
      className={cn('scroll-mt-4', isToday && 'ring-accent-500/60 ring-1')}
    >
      <header className="mb-3 flex items-start gap-3">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl border text-[0.65rem] font-semibold tracking-wider uppercase',
            isToday
              ? 'border-accent-500/50 bg-accent-500/15 text-accent-400'
              : 'border-ink-800 bg-ink-900 text-ink-500',
          )}
          aria-hidden
        >
          {(label.weekday ?? '').slice(0, 3) || String(day.index + 1)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-ink-50 flex flex-wrap items-center gap-2 text-base font-semibold">
            <span className="sr-only">{label.weekday} — </span>
            {label.name}
            {isToday && <Badge tone="accent">Today</Badge>}
          </h2>
          {day.focus !== undefined && day.focus !== '' && (
            <p className="text-ink-500 mt-0.5 text-xs">{day.focus}</p>
          )}
        </div>
        <span className="text-ink-500 numeric shrink-0 pt-0.5 text-xs">
          {working} {working === 1 ? 'exercise' : 'exercises'}
        </span>
      </header>

      <div className="space-y-3">
        {inSections(day.slots).map((section, index) => {
          const folds = section.title === 'Warm-up'
          const open = !folds || warmupOpen
          return (
            <div key={`${section.title}-${String(index)}`}>
              {folds ? (
                <button
                  type="button"
                  aria-expanded={open}
                  className="tap-target border-ink-800 bg-ink-900/50 text-ink-500 hover:text-ink-300 flex w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-xs"
                  onClick={() => {
                    setWarmupOpen(!warmupOpen)
                  }}
                >
                  <span className="tracking-wide uppercase">Warm-up</span>
                  <span className="flex items-center gap-1">
                    {section.slots.length} movements
                    {open ? (
                      <ChevronDown size={14} aria-hidden />
                    ) : (
                      <ChevronRight size={14} aria-hidden />
                    )}
                  </span>
                </button>
              ) : (
                <h3 className="text-ink-700 text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
                  {section.title}
                </h3>
              )}
              {open && (
                <ul className="divide-ink-800/70 mt-1 divide-y">
                  {section.slots.map((slot) => (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      exercise={
                        slot.exercise.kind === 'specific'
                          ? lookup(slot.exercise.exerciseId)
                          : undefined
                      }
                      athlete={athlete}
                      roundingIncrement={roundingIncrement}
                    />
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </Card>
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
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-ink-100 min-w-0 text-sm">
        {exercise?.name ??
          (slot.exercise.kind === 'query' ? slot.exercise.label : 'Unknown exercise')}
      </span>
      <span className="text-ink-500 numeric shrink-0 text-right text-xs">{line}</span>
    </li>
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
