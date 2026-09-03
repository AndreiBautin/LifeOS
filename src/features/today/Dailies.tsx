import { Archive, CalendarCog, Check, Flame, Home, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { DailyView } from '@/application/use-cases/dailies/dailies'
import type { AgendaItem, Urgency } from '@/application/use-cases/today/agenda'
import { Badge, Button, Card, Empty } from '@/components/shared/primitives'
import type { Cadence, Daily } from '@/domain/dailies/daily'

import { BASE, type RecordHome } from '@/domain/base/base'
import { WEEKDAY_LABELS, WEEKDAY_NAMES, WEEKDAYS, WEEKEND } from '@/domain/time/day'
import {
  isPartDoneOn,
  PART_OF_DAY_LABELS,
  PARTS_OF_DAY,
  partOfDayAt,
  partsOf,
  timesPerDay,
  type PartOfDay,
} from '@/domain/dailies/daily'
import { toDayKey } from '@/domain/time/day'
import { useServices } from '@/app/context'
import { Fold } from '@/components/shared/Fold'
import { counted } from '@/lib/counted'
import { byGroup, HYGIENE_GROUP, homeOrGroup } from '@/domain/dailies/groups'
import { GoalRow } from '@/features/backlog/GoalsToday'
import { useDailyGoals } from '@/features/backlog/hooks'

import { DayBands, GroupedDailies, GroupField } from './DailyGroups'
import { useAgenda } from './hooks'
import { DailyHistory } from './DailyHistory'
import {
  useAddDaily,
  useDueElsewhere,
  useMoveDailyHome,
  useRecadenceDaily,
  useRelabelDaily,
  useDailies,
  useKeepToday,
  useRemoveDaily,
  useRetireDaily,
  useUndoToday,
} from './dailies-hooks'

/**
 * The habits, and the streaks that are the only pressure in the design.
 *
 * A tick is a checkbox and nothing else — no confirmation, no animation to
 * sit through, no penalty screen. This is the control that gets tapped
 * every morning, and every gesture added to it is paid for daily.
 *
 * Unticking is the same checkbox. There is no separate undo, because a
 * mis-tap on the thing you tap most should cost exactly one more tap.
 */

/**
 * The four week shapes worth one tap.
 *
 * A cadence of "weekdays" is five taps on a row of single letters, twice
 * over if the evening picker is meant too, and it is the single most
 * common shape a habit has. The letters stay — a shortcut that hid them
 * would make anything irregular impossible — and pressing one simply
 * fills them in, so what was chosen is still visible and still editable.
 *
 * **The nights set the evening as well as the days**, which is the whole
 * difference between "weekdays" and "weeknights": the same five days,
 * and a claim about which end of them. A shortcut that set only the days
 * would be the weekdays button under a second name.
 *
 * Weeknights is Monday to Friday and weekend nights are Saturday and
 * Sunday, so the two are exact complements. The other reading — a
 * weeknight is a night before a working day, which makes Sunday one and
 * Friday not — is defensible and is a different habit; it is two taps
 * away on the letters, where this arrangement at least has the property
 * that the four buttons cover the week twice and overlap nowhere.
 */
const WEEK_SHAPES: readonly {
  readonly label: string
  readonly days: readonly number[]
  readonly part?: PartOfDay
}[] = [
  { label: 'Weekdays', days: WEEKDAYS },
  { label: 'Weekends', days: WEEKEND },
  { label: 'Weeknights', days: WEEKDAYS, part: 'evening' },
  { label: 'Weekend nights', days: WEEKEND, part: 'evening' },
]

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && [...a].sort().every((day, index) => day === [...b].sort()[index])
}

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'

/** Sunday first, matching `Date.getDay()` and every calendar app. */

/** 1st, 2nd, 3rd, 4th — for reading a day of the month back. */
function ordinal(day: number): string {
  const tens = day % 100
  if (tens >= 11 && tens <= 13) return `${String(day)}th`

  const suffix = ['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'

  return `${String(day)}${suffix}`
}

function cadenceLabel(cadence: Cadence): string {
  if (cadence.kind === 'every-day') return 'Every day'
  if (cadence.days.length === 0) return 'No days set'

  const sorted = [...cadence.days].sort((a, b) => a - b)

  if (cadence.kind === 'days-of-month') {
    return sorted.map(ordinal).join(', ')
  }

  return sorted.map((day) => WEEKDAY_LABELS[day] ?? '?').join(' ')
}

/**
 * Renaming, in the space the row was using.
 *
 * The full width, which is why it replaces the row rather than editing
 * in place inside the title column: after a tick button, a streak and
 * two icon buttons there are about a hundred and eighty pixels left, and
 * a text field and its two buttons do not fit in them.
 *
 * Shared by all three screens that list habits, for the reason
 * `AddDaily` is — Today, Base and Upkeep hold the same record, and a
 * second copy of this form is where a rename that trims differently
 * would live.
 */
export function RenameDaily({
  view,
  onDone,
}: {
  readonly view: DailyView
  readonly onDone: () => void
}) {
  const daily = view.daily
  const rename = useRelabelDaily()
  const [title, setTitle] = useState(daily.title)
  const [group, setGroup] = useState(daily.group ?? '')
  const [home, setHome] = useState(daily.belongsTo)
  const [showingCadence, setShowingCadence] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const remove = useRemoveDaily()

  return (
    <form
      className="space-y-3 py-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (title.trim() === '') return
        /*
         * One mutation, carrying all three. A title, a group and a home
         * are three fields of one record, and sending them separately is
         * two read-modify-writes of the same row — the second reads the
         * copy from before the first saved, and one of them is lost.
         */
        rename.mutate({ id: daily.id, title, group, home }, { onSuccess: onDone })
      }}
    >
      <div className="flex items-center gap-2">
        <input
          className={FIELD}
          aria-label={`Rename ${daily.title}`}
          value={title}
          /* The field opens because it was asked for, so it takes the caret.
             iOS will not raise the keyboard for a focus outside the gesture,
             which costs a second tap there and nothing anywhere else. */
          autoFocus
          enterKeyHint="done"
          onChange={(event) => {
            setTitle(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onDone()
          }}
        />
        <Button type="submit" size="sm" variant="primary" disabled={rename.isPending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>

      {/*
        The title, then the section. A title and a group are labels — the
        record means what it meant and every day kept is still kept — and
        House is the one choice here that moves it, which the field says
        under the chips.
      */}
      <GroupField value={group} onChange={setGroup} home={home} onHomeChange={setHome} />

      {/*
        The cadence, behind a press, because it is the one edit here that
        **re-reads history**: changing which days were expected changes
        every streak the habit has ever had. A habit kept every weekday
        for a year becomes a broken run the moment it is told it was an
        every-day habit all along.

        It exists because the alternative was worse — a habit on the
        wrong cadence could only be retired and typed again, and that
        throws away the run of days, which is a habit's whole value.
        Folded away and warned about, rather than open beside a name box.
      */}
      <div className="border-ink-800 border-t pt-3">
        {showingCadence ? (
          <CadenceEditor daily={daily} onDone={onDone} />
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowingCadence(true)
              }}
            >
              <CalendarCog size={14} aria-hidden />
              Change when it is expected
            </Button>
            <p className="text-ink-700 mt-1 text-xs">
              Currently {cadenceLabel(daily.cadence).toLowerCase()}
              {timesPerDay(daily) > 1 && `, ${String(timesPerDay(daily))} times a day`}.
            </p>
          </>
        )}
      </div>

      {/*
        The fortnight, and the reason this editor is worth opening at
        all: a day forgotten at eleven at night used to be gone for good.
      */}
      <div className="border-ink-800 border-t pt-3">
        <span className="text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase">
          Recent days
        </span>
        <DailyHistory view={view} />
      </div>

      {/*
        **Permanent deletion for a habit that has been kept**, which the
        row deliberately does not offer: there the button retires,
        because the days are the record. This is the way out for somebody
        who wants the row gone anyway, and it is here rather than on the
        row for the reason a pool's retire is in its editor — the more
        destructive thing sits further from the control pressed daily.

        **What it costs is named before it happens, and the XP is the
        part nobody expects.** `tallyActs` counts completions, so
        removing them takes back what they paid: a habit kept eighty
        times is 1,200 XP that goes with it, and the character level can
        fall. That is what deleting *means* — the alternative is retiring,
        which keeps both — and it is the sharpest argument for retiring,
        so it belongs on the screen rather than in this comment.
      */}
      {daily.done.length > 0 && (
        <div className="border-ink-800 border-t pt-3">
          {deleting ? (
            <div className="space-y-2">
              <p className="text-warn-500 text-xs">
                This removes the habit and the {counted(daily.done.length, 'day', 'days')} it was
                kept on, and the XP they paid. Retiring keeps all of it and only stops asking.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    remove.mutate(daily.id, { onSuccess: onDone })
                  }}
                >
                  Delete permanently
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDeleting(false)
                  }}
                >
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeleting(true)
              }}
            >
              <Trash2 size={14} aria-hidden />
              Delete permanently
            </Button>
          )}
        </div>
      )}
    </form>
  )
}

/**
 * Changing which days a habit is expected on, and how many a day.
 *
 * Reached from the label form rather than sitting in it, because this is
 * the edit that re-reads every streak. What it does **not** do is
 * rewrite anything: every day kept stays kept, and only which days were
 * *expected* changes — so the number under the habit can move without
 * any record moving. The warning says exactly that.
 */
/**
 * When in the day it belongs — none, one, or several.
 *
 * **Several, because that is what brushing your teeth is.** Reported:
 * *"some stuff, like brushing my teeth, is done twice a day, but I'd
 * like it morning and evening — that doesn't seem to be supported right
 * now since it's one row."* It was one part and a count of two, which
 * says the number and nothing about when, and drew a single row that
 * could not be in two places at once.
 *
 * Choosing more than one therefore does two things, which the caption
 * says out loud: it draws the habit once per part, and it **is** the
 * times-a-day answer. Naming morning and evening is saying twice.
 *
 * "Any time" is a real choice rather than the absence of one, so it is a
 * button beside the others and pressing it clears them. A picker where
 * clearing means un-pressing whatever you had pressed is a picker whose
 * empty state has to be discovered.
 */
function PartsField({
  parts,
  onChange,
}: {
  readonly parts: readonly PartOfDay[]
  readonly onChange: (next: readonly PartOfDay[]) => void
}) {
  const toggle = (part: PartOfDay): void => {
    const next = parts.includes(part) ? parts.filter((one) => one !== part) : [...parts, part]

    // Kept in the order the day happens, so two rows never come out
    // evening-first because that is the order they were tapped in.
    onChange(PARTS_OF_DAY.filter((one) => next.includes(one)))
  }

  return (
    <div className="space-y-1.5">
      <span className="text-ink-500 block text-xs font-medium tracking-wide uppercase">
        When in the day
      </span>

      <div className="flex gap-1">
        <button
          type="button"
          aria-pressed={parts.length === 0}
          className={[
            'tap-target flex-1 rounded-lg border px-2 text-xs font-medium',
            parts.length === 0
              ? 'border-accent-500 bg-accent-500/15 text-accent-400'
              : 'border-ink-800 text-ink-500',
          ].join(' ')}
          onClick={() => {
            onChange([])
          }}
        >
          Any time
        </button>

        {PARTS_OF_DAY.map((one) => (
          <button
            key={one}
            type="button"
            aria-pressed={parts.includes(one)}
            className={[
              'tap-target flex-1 rounded-lg border px-2 text-xs font-medium',
              parts.includes(one)
                ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                : 'border-ink-800 text-ink-500',
            ].join(' ')}
            onClick={() => {
              toggle(one)
            }}
          >
            {PART_OF_DAY_LABELS[one]}
          </button>
        ))}
      </div>

      {parts.length > 1 && (
        <p className="text-ink-600 text-xs">
          {counted(parts.length, 'row', 'rows')} a day — one in each, ticked separately.
        </p>
      )}
    </div>
  )
}

function CadenceEditor({ daily, onDone }: { readonly daily: Daily; readonly onDone: () => void }) {
  const recadence = useRecadenceDaily()
  const [monthly, setMonthly] = useState(daily.cadence.kind === 'days-of-month')
  const [days, setDays] = useState<readonly number[]>(
    daily.cadence.kind === 'every-day' ? [] : daily.cadence.days,
  )
  const [parts, setParts] = useState<readonly PartOfDay[]>(partsOf(daily))
  const [times, setTimes] = useState(String(parts.length > 0 ? 1 : timesPerDay(daily)))

  const toggle = (day: number): void => {
    setDays(days.includes(day) ? days.filter((one) => one !== day) : [...days, day])
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {[false, true].map((isMonthly) => (
          <button
            key={String(isMonthly)}
            type="button"
            aria-pressed={monthly === isMonthly}
            className={[
              'tap-target flex-1 rounded-lg border px-3 text-xs font-medium',
              monthly === isMonthly
                ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                : 'border-ink-800 text-ink-500',
            ].join(' ')}
            onClick={() => {
              setMonthly(isMonthly)
              setDays([])
            }}
          >
            {isMonthly ? 'Days of the month' : 'Days of the week'}
          </button>
        ))}
      </div>

      {!monthly && (
        <div className="flex gap-1">
          {WEEK_SHAPES.map((shape) => (
            <button
              key={shape.label}
              type="button"
              aria-pressed={sameDays(days, shape.days)}
              className={[
                'tap-target flex-1 rounded-lg border px-1 text-xs font-medium',
                sameDays(days, shape.days)
                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                  : 'border-ink-800 text-ink-500',
              ].join(' ')}
              onClick={() => {
                setDays([...shape.days])
              }}
            >
              {shape.label}
            </button>
          ))}
        </div>
      )}

      <span className="text-ink-500 block text-xs font-medium tracking-wide uppercase">
        Which days · none for every day
      </span>

      <div className={monthly ? 'grid grid-cols-7 gap-1' : 'flex gap-1'}>
        {(monthly
          ? Array.from({ length: 31 }, (_unused, index) => index + 1)
          : [0, 1, 2, 3, 4, 5, 6]
        ).map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={days.includes(day)}
            aria-label={monthly ? ordinal(day) : (WEEKDAY_NAMES[day] ?? String(day))}
            className={[
              'tap-target rounded-lg border text-xs font-medium',
              monthly ? '' : 'flex-1',
              days.includes(day)
                ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                : 'border-ink-800 text-ink-500',
            ].join(' ')}
            onClick={() => {
              toggle(day)
            }}
          >
            {monthly ? day : (WEEKDAY_LABELS[day] ?? '?')}
          </button>
        ))}
      </div>

      <PartsField parts={parts} onChange={setParts} />

      {/*
        The count is hidden once parts are named, because they answer it.
        Showing both would put two controls on one screen for one
        question and let them disagree — the trap the fatigue allowance
        records, where two fields would have left no sentence to say.
      */}
      {parts.length === 0 && (
        <label className="text-ink-500 flex items-center gap-2 text-xs">
          <span className="shrink-0">Times a day</span>
          <input
            className="bg-ink-850 border-ink-800 text-ink-50 numeric tap-target w-16 rounded-lg border px-2 text-sm"
            inputMode="decimal"
            aria-label="Times a day"
            value={times}
            onChange={(event) => {
              setTimes(event.target.value)
            }}
          />
        </label>
      )}

      {/*
        Said before the change rather than after. Nothing is rewritten —
        every day kept stays kept — but the streak is read back through
        the new cadence, so the number can move without a record moving.
      */}
      <p className="text-warn-500 text-xs">
        Every day you kept it stays kept. The streak is worked out from which days were expected, so
        it may read differently after this.
      </p>

      <Button
        type="button"
        variant="primary"
        size="sm"
        full
        disabled={recadence.isPending}
        onClick={() => {
          const howMany = Math.max(1, Math.round(Number(times) || 1))

          recadence.mutate(
            {
              id: daily.id,
              timesPerDay: howMany,
              partsOfDay: parts,
              // No days picked means every day — the same reading the add
              // form gives an untouched row.
              cadence:
                days.length === 0
                  ? { kind: 'every-day' }
                  : monthly
                    ? { kind: 'days-of-month', days }
                    : { kind: 'days-of-week', days },
            },
            { onSuccess: onDone },
          )
        }}
      >
        Save when it is expected
      </Button>
    </div>
  )
}

/**
 * A habit's name, and the way to change it.
 *
 * The title *is* the control, rather than a fourth icon button on a row
 * that already carries three plus a streak — at 375 there is no room for
 * one, and the name is the only thing on the row that is not already
 * something you press. The pencil beside it is what says so, since a
 * phone has no hover to reveal it with.
 */
export function DailyTitle({
  daily,
  done,
  onRename,
}: {
  readonly daily: Daily
  readonly done: boolean
  readonly onRename: () => void
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 max-w-full items-center gap-1.5 text-left"
      aria-label={`Rename ${daily.title}`}
      onClick={onRename}
    >
      <span
        className={[
          'truncate text-sm',
          done ? 'text-ink-500 line-through' : 'text-ink-50 font-medium',
        ].join(' ')}
      >
        {daily.title}
      </span>
      <Pencil size={12} className="text-ink-700 shrink-0" aria-hidden />
    </button>
  )
}

export function DailyRow({
  view,
  part,
}: {
  readonly view: DailyView
  /**
   * Which appearance of the habit this row is, when it names parts.
   *
   * A habit set to morning and evening draws two rows, and each one
   * ticks **its own part**: without this both would read the record's
   * whole-day state, so keeping the morning would turn the evening green
   * and there would be no way to say which had actually been done.
   */
  readonly part?: PartOfDay | undefined
}) {
  // From the record, so a chore shown on Today still pays as a chore.
  const keep = useKeepToday(view.daily.belongsTo)
  const clock = useServices().clock
  const nowPart = partOfDayAt(clock.now())
  const undo = useUndoToday()
  const retire = useRetireDaily()
  const remove = useRemoveDaily()
  const moveHome = useMoveDailyHome()
  const [confirming, setConfirming] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const { daily, expectedToday } = view

  /*
   * A parted row answers about **its part** and an unparted one about
   * the record, which is the whole of the difference between the two
   * shapes. The counter — "1 of 3" — is what a habit with no named parts
   * uses to say how far into the day it is; a parted row needs none,
   * because it is one of the parts and is either done or not.
   */
  const today = toDayKey(clock.now())
  const doneToday = part === undefined ? view.doneToday : isPartDoneOn(daily, today, part)
  const doneCount = part === undefined ? view.doneCount : 0
  const needed = part === undefined ? view.needed : 1

  /*
   * The row's own part where it has one, and otherwise the first the
   * habit names. The fallback is for a caller that renders a row without
   * expanding occurrences — there is none today, and a row that silently
   * dropped the word would be a worse thing to find than a redundant
   * line of code.
   */
  const shownPart = part ?? partsOf(daily)[0]

  /*
   * Ever kept, not kept *today*. A habit ticked once in March and never
   * since is still a record of a day that happened, and the count is
   * what the retire/delete choice turns on.
   */
  const everKept = daily.done.length > 0

  if (renaming) {
    return (
      <RenameDaily
        view={view}
        onDone={() => {
          setRenaming(false)
        }}
      />
    )
  }

  return (
    <div className="flex items-center gap-3 py-2">
      {/*
        One tap adds one completion. For a habit asked for several times a
        day the button counts rather than toggles — tapping it at the
        second feed must record a third, not undo the first — and it only
        becomes an untick once the day is full, which is the point at
        which the next tap can only mean a mistake.
      */}
      <button
        type="button"
        aria-label={
          doneToday
            ? `Untick ${daily.title}`
            : needed > 1
              ? `Log ${daily.title}, ${String(doneCount)} of ${String(needed)} done`
              : `Tick ${daily.title}`
        }
        aria-pressed={doneToday}
        className={[
          'tap-target grid size-9 shrink-0 place-items-center rounded-lg border text-xs font-semibold transition-colors',
          doneToday
            ? 'border-good-500 bg-good-500/15 text-good-500'
            : doneCount > 0
              ? 'border-good-500/50 text-good-500'
              : 'border-ink-700 text-ink-700 hover:border-ink-500',
        ].join(' ')}
        onClick={() => {
          if (doneToday) undo.mutate({ id: daily.id, ...(part === undefined ? {} : { part }) })
          else keep.mutate({ id: daily.id, ...(part === undefined ? {} : { part }) })
        }}
      >
        {doneToday ? (
          <Check size={18} aria-hidden />
        ) : (
          needed > 1 && doneCount > 0 && `${String(doneCount)}/${String(needed)}`
        )}
      </button>

      <div className="min-w-0 flex-1">
        <DailyTitle
          daily={daily}
          done={doneToday}
          onRename={() => {
            setRenaming(true)
          }}
        />
        <p className="text-ink-600 text-xs">
          {/*
            Lit when it is that part of the day now. It never changes
            whether something counts as done — the streak's humane rule
            stands, and an unticked morning does not break anything until
            the day is over — it only says which end of the day you are
            at.
          */}
          {/*
            The row's own part where it has one, and otherwise the first
            the habit names — a list drawn without bands still has to say
            when each row belongs, and a row inside a band repeats its
            heading cheaply rather than going silent about it.
          */}
          {shownPart !== undefined && (
            <span className={shownPart === nowPart ? 'text-accent-400' : undefined}>
              {PART_OF_DAY_LABELS[shownPart]}
              {' · '}
            </span>
          )}
          {cadenceLabel(daily.cadence)}
          {needed > 1 && ` · ${String(doneCount)} of ${String(needed)} today`}
          {!expectedToday && ' · not today'}
        </p>
      </div>

      {view.streak > 0 && (
        <span className="text-ink-400 numeric flex shrink-0 items-center gap-1 text-xs">
          <Flame size={14} aria-hidden />
          {view.streak}
        </span>
      )}

      {/*
        **The move goes the way the row is not currently filed.** An own
        habit offers Base, for the hoovering somebody added here before
        noticing it was house work; anything already filed elsewhere
        offers the way back.

        It was Base unconditionally, which was harmless while this row
        only ever drew own habits and House rows — a House row offering
        "move to Base" is merely useless. It stopped being harmless when
        upkeep joined the day list: a toothbrushing habit one tap from
        becoming a house chore, with no way back on this screen.

        A move rather than a re-create, either way: the days it has been
        kept on are the whole value of the record.
      */}
      <Button
        size="sm"
        variant="ghost"
        aria-label={
          daily.belongsTo === undefined
            ? `Move ${daily.title} to Base`
            : `Move ${daily.title} back to Today`
        }
        disabled={moveHome.isPending}
        onClick={() => {
          moveHome.mutate(
            daily.belongsTo === undefined
              ? { id: daily.id, home: BASE }
              : { id: daily.id, home: undefined },
          )
        }}
      >
        {daily.belongsTo === undefined ? (
          <Home size={16} aria-hidden />
        ) : (
          <Undo2 size={16} aria-hidden />
        )}
      </Button>

      {/*
        **Retire what was kept, delete what never was**, and the button
        says which it is doing. Reported simply as *"I seem to not be
        able to delete dailies"* — you could not: `removeDaily` and
        `useRemoveDaily` were written, tested, and called by **nothing
        anywhere in the app**, so the only way out was retiring, which
        keeps the record forever and cannot be undone from any screen.

        The rule this follows is the one `attempts` already states: a
        habit's kept days *are* the record and retiring keeps them, while
        a row created by mistake — a typo, a duplicate, a habit added and
        thought better of — is not a thing that happened, and leaving it
        in the database and in every sync is worse than removing it.

        So the same button does both, chosen by whether there is anything
        to lose. That is also why the confirm reads differently: retiring
        is reversible in principle and deleting is not.
      */}
      <Button
        size="sm"
        variant={confirming ? 'danger' : 'ghost'}
        aria-label={
          confirming
            ? `Confirm ${everKept ? 'retiring' : 'deleting'} ${daily.title}`
            : `${everKept ? 'Retire' : 'Delete'} ${daily.title}`
        }
        onClick={() => {
          if (!confirming) setConfirming(true)
          else if (everKept) retire.mutate(daily.id)
          else remove.mutate(daily.id)
        }}
      >
        {confirming ? (
          'Sure?'
        ) : everKept ? (
          <Archive size={16} aria-hidden />
        ) : (
          <Trash2 size={16} aria-hidden />
        )}
      </Button>
    </div>
  )
}

/**
 * The add form, shared by Today and Base.
 *
 * Exported rather than copied: a chore and a daily are the same record
 * on the same three cadences, and the second copy of this would be the
 * place a cadence bug lives on after the first is fixed. `home` is the
 * only difference between the two callers.
 */
/**
 * A habit offered by name, ready to file in one tap.
 *
 * **This was `Filing`, and it carried a choice of home.** Today owned
 * two — your own habits and upkeep — so the form had to ask. Upkeep is a
 * `group` label now, so there is one home again and nothing to ask
 * about: what is left is the four body chores, each carrying the group
 * it belongs to.
 *
 * Passed already filtered. The caller knows every title in use across
 * every home, and pushing that set through the form only to filter
 * inside it would put the same decision in two places.
 */
export interface Suggested {
  readonly title: string
  readonly group?: string | undefined
  readonly timesPerDay?: number
}

export function AddDaily({
  onDone,
  home,
  suggestions,
  placeholder = 'Something you mean to do daily',
}: {
  readonly onDone: () => void
  readonly home?: RecordHome
  readonly suggestions?: readonly Suggested[]
  readonly placeholder?: string
}) {
  const add = useAddDaily(home)
  const [title, setTitle] = useState('')
  const [days, setDays] = useState<readonly number[]>([])
  const [monthly, setMonthly] = useState(false)
  const [times, setTimes] = useState('1')
  const [parts, setParts] = useState<readonly PartOfDay[]>([])
  const [group, setGroup] = useState('')
  /*
   * Only the screens showing more than one home let this be chosen —
   * Base and Train pass their own `home` and force it, so a chip there
   * would be a control that cannot change anything.
   */
  const [filed, setFiled] = useState<RecordHome | undefined>(undefined)

  const toggle = (day: number): void => {
    setDays(days.includes(day) ? days.filter((one) => one !== day) : [...days, day])
  }

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          const howMany = Math.max(1, Math.round(Number(times) || 1))

          add.mutate(
            {
              title,
              ...(howMany > 1 ? { timesPerDay: howMany } : {}),
              ...(parts.length === 0 ? {} : { partsOfDay: parts }),
              ...(group.trim() === '' ? {} : { group }),
              ...(filed === undefined ? {} : { belongsTo: filed }),
              // No days picked means every day, which is what somebody who
              // ignored this row meant by ignoring it.
              cadence:
                days.length === 0
                  ? { kind: 'every-day' }
                  : monthly
                    ? { kind: 'days-of-month', days }
                    : { kind: 'days-of-week', days },
            },
            { onSuccess: onDone },
          )
        }}
      >
        <input
          className={FIELD}
          value={title}
          aria-label="New daily"
          placeholder={placeholder}
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />

        {/*
          The habits offered by name, minus the ones already in use — the
          pools' rule, and the reason it is *by name* rather than gated
          on an empty list: adding the first must not take the other
          three away.

          They submit on their own rather than filling the field, because
          a suggestion whose whole value is saving a tap should not cost
          two. The group travels with the suggestion, which is how upkeep
          survives having stopped being a home.
        */}
        {suggestions !== undefined && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion.title}
                type="button"
                variant="outline"
                size="sm"
                disabled={add.isPending}
                onClick={() => {
                  add.mutate(
                    {
                      title: suggestion.title,
                      cadence: { kind: 'every-day' },
                      ...(suggestion.group === undefined ? {} : { group: suggestion.group }),
                      ...(suggestion.timesPerDay === undefined
                        ? {}
                        : { timesPerDay: suggestion.timesPerDay }),
                    },
                    { onSuccess: onDone },
                  )
                }}
              >
                <Plus size={14} aria-hidden />
                {suggestion.title}
              </Button>
            ))}
          </div>
        )}

        {/*
          When in the day it belongs, which is a third question again:
          which days, how many on one of them, and whereabouts in it.
          Coarse because nothing can ring — see `partsOfDay`.
        */}
        <PartsField parts={parts} onChange={setParts} />

        {/*
          The group. Offered as chips rather than only a box, because the
          names already in use are better answers than anything suggested
          — the same reason a pool's quick amounts end up being what you
          actually drink. Pressing a chip that is already chosen clears
          it, so leaving a group needs no separate control.
        */}
        <GroupField
          value={group}
          onChange={setGroup}
          home={filed}
          {...(home === undefined ? { onHomeChange: setFiled } : {})}
        />

        {/*
          How many times on each of those days. Separate from the cadence
          above because the two answer different questions — which days,
          and how many on one of them — and a habit done three times on
          weekdays needs both.

          Hidden once parts are named, because naming morning and evening
          already answers it. Two controls for one question is how they
          come to disagree.
        */}
        {parts.length === 0 && (
          <label className="text-ink-500 flex items-center gap-2 text-xs">
            <span className="shrink-0">Times a day</span>
            <input
              className="bg-ink-850 border-ink-800 text-ink-50 numeric tap-target w-16 rounded-lg border px-2 text-sm"
              inputMode="decimal"
              aria-label="Times a day"
              value={times}
              onChange={(event) => {
                setTimes(event.target.value)
              }}
            />
          </label>
        )}

        <div className="space-y-2">
          <div className="flex gap-1">
            {[false, true].map((isMonthly) => (
              <button
                key={String(isMonthly)}
                type="button"
                aria-pressed={monthly === isMonthly}
                className={[
                  'tap-target flex-1 rounded-lg border px-3 text-xs font-medium',
                  monthly === isMonthly
                    ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                    : 'border-ink-800 text-ink-500',
                ].join(' ')}
                onClick={() => {
                  setMonthly(isMonthly)
                  setDays([])
                }}
              >
                {isMonthly ? 'Days of the month' : 'Days of the week'}
              </button>
            ))}
          </div>

          <span className="text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase">
            Which days · none for every day
          </span>

          {monthly ? (
            /*
             * 1 to 31. A day past the end of a short month simply does not
             * occur that month rather than sliding to the 28th, so the
             * note says which choices are safe for a chore that must
             * happen every month.
             */
            <>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 31 }, (_unused, index) => index + 1).map((day) => (
                  <button
                    key={day}
                    type="button"
                    aria-label={ordinal(day)}
                    aria-pressed={days.includes(day)}
                    className={[
                      'tap-target h-10 rounded-lg border text-xs font-medium',
                      days.includes(day)
                        ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                        : 'border-ink-800 text-ink-500',
                    ].join(' ')}
                    onClick={() => {
                      toggle(day)
                    }}
                  >
                    {day}
                  </button>
                ))}
              </div>
              {days.some((day) => day > 28) && (
                <p className="text-ink-500 text-xs">
                  The 29th to 31st are skipped in months that are too short, rather than sliding
                  earlier. Pick the 28th or lower for something that must happen every month.
                </p>
              )}
            </>
          ) : (
            <>
              {/*
                Above the letters rather than replacing them. Pressed
                state comes from comparing the current selection, so the
                button says what is chosen rather than what was last
                tapped — picking the five days by hand lights "Weekdays",
                which is the honest reading of a shortcut.
              */}
              <div className="mb-2 flex flex-wrap gap-1">
                {WEEK_SHAPES.map((shape) => {
                  /*
                   * The part has to match too, including when the shape
                   * does not name one: "Weekdays" means those five days
                   * at any time, so it must not stay lit once the evening
                   * is chosen. Otherwise picking Weeknights lights both,
                   * and two pressed buttons describing one cadence is a
                   * worse answer than none.
                   */
                  const on =
                    sameDays(days, shape.days) &&
                    (shape.part === undefined
                      ? parts.length === 0
                      : parts.length === 1 && parts[0] === shape.part)

                  return (
                    <button
                      key={shape.label}
                      type="button"
                      aria-pressed={on}
                      className={[
                        'tap-target rounded-lg border px-3 text-xs font-medium',
                        on
                          ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                          : 'border-ink-800 text-ink-500',
                      ].join(' ')}
                      onClick={() => {
                        setDays([...shape.days])
                        // A night shape names its part and nothing else;
                        // a day shape says nothing about when, so it
                        // leaves whatever was chosen alone.
                        if (shape.part !== undefined) setParts([shape.part])
                      }}
                    >
                      {shape.label}
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((label, index) => (
                  <button
                    key={WEEKDAY_NAMES[index]}
                    type="button"
                    aria-label={WEEKDAY_NAMES[index] ?? ''}
                    aria-pressed={days.includes(index)}
                    className={[
                      'tap-target h-10 flex-1 rounded-lg border text-xs font-medium',
                      days.includes(index)
                        ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                        : 'border-ink-800 text-ink-500',
                    ].join(' ')}
                    onClick={() => {
                      toggle(index)
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <Button type="submit" variant="primary" full disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Add it
        </Button>
      </form>
    </Card>
  )
}

/**
 * The body's chores, offered by name.
 *
 * Hygiene was the one list in the app with no suggestions — you typed
 * every row — and it is the list whose contents are the least personal:
 * everybody's is roughly brushing, flossing, hair and water. Water is
 * the reason it still exists, since taking it off the pool suggestions
 * left the only other way to it a form.
 *
 * Named for the thing being ticked rather than for the substance: a row
 * reading just "Water" would be a checkbox against a question nobody
 * fails, where the point is whether the day's target was finished.
 * `timesPerDay` is on brushing because two is what brushing is.
 */
/**
 * One row of the day: a habit, which of its parts this is, and whether
 * that part is done.
 *
 * The view is carried rather than looked up because every consumer here
 * needs it, and `done` is precomputed because the answer differs by row
 * — `view.doneToday` is about the whole record and is the wrong question
 * for a habit that names two parts.
 */
interface Occurrence {
  readonly view: DailyView
  readonly part?: PartOfDay | undefined
  readonly done: boolean
}

/**
 * The finished rows, under the fold.
 *
 * Grouped by category and **not** banded by part of day: a fold is
 * already a lid, and a second axis of headings inside one is structure
 * nobody asked to see. `homeOrGroup` keeps a done chore and a done habit
 * labelled House under one heading here too.
 *
 * It draws from the occurrences rather than from `GroupedDailies` so
 * that a half-finished habit contributes only the row that is actually
 * done — the morning brushing folds away while the evening one is still
 * on the list above.
 */
function DoneRows({ rows }: { readonly rows: readonly Occurrence[] }) {
  return (
    <div className="space-y-2">
      {byGroup(
        rows.map(({ view, part }) => ({
          daily: view.daily,
          ...(part === undefined ? {} : { part }),
        })),
        homeOrGroup,
      ).map((group) => (
        <div key={group.name ?? '·ungrouped'}>
          {group.name !== undefined && (
            <span className="text-ink-700 mb-1 block text-xs tracking-wide uppercase">
              {group.name}
            </span>
          )}
          <Card className="divide-ink-800 divide-y py-0">
            {group.occurrences.map(({ daily, part }) => {
              const row = rows.find((one) => one.view.daily.id === daily.id && one.part === part)

              return row === undefined ? null : (
                <DailyRow key={`${daily.id}#${part ?? ''}`} view={row.view} part={part} />
              )
            })}
          </Card>
        </div>
      ))}
    </div>
  )
}

/**
 * What an agenda row's area is called where it appears as a group.
 *
 * The three that are left once the Codex goals moved into the day's
 * list: a quest's deadline, or a trip.
 */
const AGENDA_GROUPS: Record<AgendaItem['area'], string> = {
  quests: 'Quests',
  map: 'Trips',
}

const URGENCY_TONE: Record<Urgency, 'bad' | 'accent' | 'neutral'> = {
  overdue: 'bad',
  today: 'accent',
  soon: 'neutral',
}

const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: 'Overdue',
  today: 'Today',
  soon: 'Soon',
}

/**
 * A dated thing from another area, as a row in the day's list.
 *
 * **It links rather than ticks, and that is the honest difference.**
 * Everything else here is answered where it is drawn; a deadline is
 * answered on the quest, a trip on the map, a person by seeing them. So
 * the whole row is the link, and it carries no control that would imply
 * otherwise.
 */
function AgendaRow({ item }: { readonly item: AgendaItem }) {
  return (
    <Link to={item.href} className="hover:bg-ink-850 flex items-center gap-3 rounded-lg px-2 py-2">
      <span className="min-w-0 flex-1">
        <span className="text-ink-100 block truncate text-sm">{item.title}</span>
        <span className="text-ink-500 block truncate text-xs">{item.detail}</span>
      </span>
      <Badge tone={URGENCY_TONE[item.urgency]}>{URGENCY_LABEL[item.urgency]}</Badge>
    </Link>
  )
}

const HYGIENE_SUGGESTIONS: readonly {
  readonly title: string
  readonly group?: string
  readonly timesPerDay?: number
}[] = [
  { title: 'Gallon of water', group: HYGIENE_GROUP },
  { title: 'Brush teeth', group: HYGIENE_GROUP, timesPerDay: 2 },
  { title: 'Floss', group: HYGIENE_GROUP },
  { title: 'Shower', group: HYGIENE_GROUP },
  { title: 'Wash hair', group: HYGIENE_GROUP },
]

/**
 * The header's disclosure mark.
 *
 * Drawn rather than imported so the open and closed states are one
 * shape with one line changing — a swap between two lucide icons reads
 * as two different controls at 16 pixels.
 */
function EyeIcon({ open }: { readonly open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" aria-hidden>
      <path
        d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12Z"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" strokeWidth="1.8" />
      {!open && <path d="M4 20 20 4" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  )
}

export function Dailies() {
  const dailies = useDailies('own-area')
  const due = useDueElsewhere()
  /*
   * **Codex reading goals are in this section, not the agenda.** Asked
   * for as *"why not just group 'em with dailies, just separated."* A
   * Codex goal carries the habits' own `Cadence`, is expected on named
   * days, holds a streak, and is answered by logging a bit of it — a
   * daily in every respect except the record type. It had been sitting
   * among deadlines and trips, under a heading that then had to claim it
   * covered everything due.
   *
   * Only what is expected today. `isDueToday` is the goal's own cadence
   * answer, and the Codex screen still shows the rest for the reason it
   * always did: logging on a day you did not plan to read happens, and a
   * row that vanished there would read as lost.
   */
  const goals = (useDailyGoals().data?.statuses ?? []).filter((one) => one.isDueToday)

  /*
   * **The agenda is in here too, and "Due elsewhere" is gone.**
   * Reported: *"I just see an empty due elsewhere now — that's not
   * really helpful, why not move everything to where you moved the Codex
   * stuff."* Fair on both counts. A section that renders a heading and
   * an empty state on a screen whose own rule is *silent when there is
   * nothing to say* was noise, and once the Codex goals had moved there
   * was no reason the other three should not follow.
   *
   * So this section is the whole answer to "what does today ask of me",
   * whatever record each row happens to be: habits, reading goals,
   * deadlines, trips and people.
   */
  const agenda = useAgenda().data ?? []
  const services = useServices()
  const [adding, setAdding] = useState(false)
  /*
   * Not persisted, deliberately. It is a glance at what is already done
   * rather than a preference — the day resets it, which is the right
   * default for a screen whose whole job is the present tense.
   */
  const [showingRest, setShowingRest] = useState(false)
  const [showLater, setShowLater] = useState(false)

  const views = dailies.data ?? []

  /*
   * **A screen called Today does not list things labelled "not today".**
   * Own dailies used to show in full, on the reasoning that Today is
   * their only home and therefore also where they are managed. The first
   * half is true and the second does not follow: a weekday habit sat in
   * Saturday's list wearing a "not today" caption, which is a screen
   * arguing with itself, and it is the same crowding that moved chores
   * to Base — the things the day actually asks for buried under the ones
   * it does not.
   *
   * They are still here, because there is still nowhere else for them.
   * They are below everything due, under a heading that says what they
   * are, in the same shape the House and Hygiene groups already use.
   */
  /*
   * **This section is the day, across every home, and now it is one
   * list.** House and Training used to be drawn by a `DueElsewhere` pass
   * of their own, below the habits, grouped by where each was filed.
   * That is what produced the report this pass answers: a habit given
   * the group *House* on this screen appeared under a House heading in
   * the first pass while the chores sat under a second House heading in
   * the second, with nothing on screen to say why one name had two
   * sections.
   *
   * They are one axis now — see `HOME_GROUP_LABELS`. A row's category is
   * its home's label where it has a home and its group otherwise, so a
   * chore and a habit somebody labelled House land in one place by
   * construction rather than by anybody remembering to keep two passes
   * in step. Nothing is re-filed: an own habit labelled House is still
   * own-area, still pays `dailies.completed`, and is still managed here.
   *
   * The "all →" links to `/base` and `/train` went with that pass, and
   * the reason is the banding rather than tidiness: a category now
   * appears once per part of the day it has work in, so House with a
   * morning chore and an evening one would draw the link twice. Both are
   * bottom-nav tabs, so nothing became unreachable.
   *
   * What has to stay true is the rule that cost two attempts to find: a
   * count and the rows beneath it are the same claim. "2 left today"
   * over an empty list is the failure, and it is why `left` is built
   * from the same list the section draws.
   */
  const elsewhere = due.data ?? []

  /*
   * **The unit of this screen is an occurrence, not a record**, and that
   * is what makes morning-and-evening work. A habit naming two parts is
   * two rows with two ticks, so every question the screen asks — is this
   * outstanding, is it for later, is it finished — has to be asked of
   * the row rather than of the habit. Asking the record would have
   * keeping the morning turn the evening green.
   *
   * A habit naming no parts has exactly one occurrence with no part, so
   * nothing about the ordinary case goes through a special branch.
   */
  const today = toDayKey(services.clock.now())
  const rows = (source: readonly DailyView[]): readonly Occurrence[] =>
    source.flatMap((view) => {
      const parts = partsOf(view.daily)

      return parts.length === 0
        ? [{ view, done: view.doneToday }]
        : parts.map((part) => ({ view, part, done: isPartDoneOn(view.daily, today, part) }))
    })

  const dueRows = rows([...views, ...elsewhere].filter((view) => view.expectedToday))

  const outstanding = dueRows.filter((row) => !row.done)

  /*
   * **Done rows fold away, and this reverses a rule written directly
   * above.** That rule said only what is still to do gets hidden,
   * because hiding something already done invites doing it twice. The
   * report was that the screen is *"cluttered with everything that gets
   * checked off"* — and on a list that grows all day, the evidence of
   * what is finished is exactly what buries what is not.
   *
   * The tick still answers doing it twice: a done row reads
   * `aria-pressed` and the header says how many are left. What the fold
   * protects is **undo**, which is the only route back from a mis-tap
   * and would be gone if these were filtered out rather than folded.
   *
   * Per **occurrence**, so a habit brushed in the morning and not yet at
   * night has its morning row folded away and its evening row still
   * asking. Folding the record would hide half a day's work as though it
   * were finished.
   */
  const done = dueRows.filter((row) => row.done)

  /*
   * Split the same way the habits are, so a met goal folds away with
   * everything else finished rather than sitting on the list looking
   * outstanding — and folded rather than dropped, because the minus on
   * its row is the only way back from a mis-logged page.
   */
  const goalsLeft = goals.filter((one) => !one.isMet)
  const goalsDone = goals.filter((one) => one.isMet)

  /*
   * **Overdue and today are the day; soon is a fold.** A trip in four
   * days is not what today asks, and putting it in the day's count would
   * make that count say something it does not mean — the rule that a
   * count and the rows under it are one claim.
   *
   * It is still worth having on the screen, which is why it folds rather
   * than disappearing: the whole reason the agenda exists is that a
   * deadline four days out was readable only by opening the quest.
   */
  const dueNow = agenda.filter((item) => item.urgency !== 'soon')
  const soon = agenda.filter((item) => item.urgency === 'soon')

  /* Grouped by area, in the order the agenda already sorted them. */
  const agendaGroups = (['quests', 'map'] as const)
    .map((area) => ({ area, rows: dueNow.filter((item) => item.area === area) }))
    .filter((group) => group.rows.length > 0)

  /*
   * Own habits only — which now includes hygiene. House and Training are
   * managed on their own screens, and `useDueElsewhere` never offers
   * their other days in the first place.
   */
  const otherDays = views.filter((view) => !view.expectedToday)

  /*
   * **Later today folds away, and the order never moves.**
   *
   * The report: *"can we not surface tasks until it's time for them, so
   * I'm not combing through stuff that isn't applicable in the moment."*
   * The obvious answer is to sort the current part to the top, and this
   * file already argues against that: the list would reorder itself
   * twice a day, so the row you reach for by position moves, and a
   * glance at breakfast and a glance at bedtime disagree about where
   * anything is. The current part is *lit* instead.
   *
   * Hiding is the version that gets what was asked for without that
   * cost. Nothing is reordered; a later part is simply not drawn until
   * it is time, and one press shows it.
   *
   * **Only what is still to do gets hidden.** A habit you finished early
   * stays on the list, because hiding something already done invites
   * doing it twice — and it is evidence rather than a task. Earlier
   * parts stay too: a morning pill forgotten at noon is exactly what
   * this screen is for.
   */
  const nowPart = partOfDayAt(services.clock.now())
  const nowIndex = PARTS_OF_DAY.indexOf(nowPart)
  const isLater = (row: Occurrence): boolean =>
    row.part !== undefined && PARTS_OF_DAY.indexOf(row.part) > nowIndex

  const later = outstanding.filter(isLater)
  const showing = showLater ? outstanding : outstanding.filter((row) => !isLater(row))

  /*
   * Counted across every home, because the sentence is about the day and
   * not about this section. "3 left today" that ignored the bins would
   * be answering a question nobody asked — and with one list the count
   * and the rows cannot come apart, which is what two passes made
   * possible.
   */
  /*
   * Everything outstanding today, whatever record it is. A deadline due
   * today is outstanding today even though it is answered on another
   * screen, so leaving it out would make the sentence quietly false.
   */
  const left = outstanding.length + goalsLeft.length + dueNow.length

  /* Every title in use, so nothing is offered that already exists. */
  const taken = new Set(
    [...views, ...elsewhere].map((view) => view.daily.title.trim().toLowerCase()),
  )

  /*
   * What the header's eye reveals: everything the day is not asking for
   * but that still has a control on it.
   */
  const resting = [...done, ...goalsDone, ...otherDays]

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-ink-500 text-sm">
          {views.length === 0 && elsewhere.length === 0
            ? 'Nothing yet.'
            : left === 0
              ? 'All done for today.'
              : `${left.toString()} left today`}
        </p>
        <div className="flex items-center gap-1">
          {/*
            **One control in the header, where two lids used to sit in
            the flow.** Reported: _"get rid of the done today and habits
            on other days lines, it breaks up the flow of the cards."_
            It did — two summary rows between cards, each announcing a
            list nobody had asked to see.

            The rows themselves could not simply go: a ticked habit's row
            is the only route to **undo**, and a not-due habit's is the
            only route to renaming or retiring it. Dropping them would
            take working controls away to tidy a list, which is the shape
            of mistake this file keeps recording. So the disclosure moved
            to the header and the lines went.

            Hidden from a reader when there is nothing behind it, rather
            than shown disabled: a control that cannot do anything is
            worse than one that is not there.
          */}
          {resting.length > 0 && (
            <Button
              size="sm"
              variant={showingRest ? 'primary' : 'ghost'}
              aria-pressed={showingRest}
              aria-label={`${showingRest ? 'Hide' : 'Show'} ${String(resting.length)} done and not due today`}
              onClick={() => {
                setShowingRest(!showingRest)
              }}
            >
              <EyeIcon open={showingRest} />
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              setAdding(!adding)
            }}
          >
            {adding ? 'Close' : 'Add'}
          </Button>
        </div>
      </div>

      {adding && (
        <AddDaily
          /*
           * Filtered here rather than inside the form, which now needs no
           * opinion about where a habit is filed: there is one home
           * again, and what used to be the Upkeep chip is a group label
           * the suggestions carry.
           */
          suggestions={HYGIENE_SUGGESTIONS.filter(
            (one) => !taken.has(one.title.trim().toLowerCase()),
          )}
          onDone={() => {
            setAdding(false)
          }}
        />
      )}

      {views.length === 0 &&
        elsewhere.length === 0 &&
        goals.length === 0 &&
        agenda.length === 0 && (
          <Empty title="No dailies yet">
            A daily here is a checkbox and a streak. It cannot ring — nothing in a web app on iOS
            can — so it earns its place by being the first thing on this screen.
          </Empty>
        )}

      {/*
        The day in bands, with the categories inside each — see
        `DayBands`. The part of day is outermost because a screen called
        Today answers "is this now" before "what sort of thing is this".
      */}
      {showing.length > 0 && (
        <DayBands
          occurrences={showing.map(({ view, part }) => ({
            daily: view.daily,
            ...(part === undefined ? {} : { part }),
          }))}
          views={showing.map((row) => row.view)}
          now={nowPart}
          render={(view, part) => <DailyRow view={view} part={part} />}
        />
      )}

      {/*
        **Its own group, under the habits.** Separated rather than mixed
        in, because a Codex goal is answered by logging an amount where a
        habit is answered by a tick — so it gets one heading in the shape
        House and Hygiene already use, and no attempt to band it by part
        of day: a reading goal names no time.
      */}
      {goalsLeft.length > 0 && (
        <div className="mt-2">
          <span className="text-ink-700 mb-1 block text-xs tracking-wide uppercase">Codex</span>
          <Card className="divide-ink-800 divide-y py-0">
            {goalsLeft.map((status) => (
              <GoalRow key={status.item.id} status={status} />
            ))}
          </Card>
        </div>
      )}

      {/*
        The dated things, one group per area, in the same shape as the
        Codex group above. Below the habits and the goals because those
        are answered here and these are answered somewhere else.
      */}
      {agendaGroups.map((group) => (
        <div key={group.area} className="mt-2">
          <span className="text-ink-700 mb-1 block text-xs tracking-wide uppercase">
            {AGENDA_GROUPS[group.area]}
          </span>
          <Card className="divide-ink-800 divide-y py-0">
            {group.rows.map((item) => (
              <AgendaRow key={item.id} item={item} />
            ))}
          </Card>
        </div>
      ))}

      {later.length > 0 && (
        <button
          type="button"
          className="text-ink-700 hover:text-ink-500 tap-target mt-1 text-xs"
          onClick={() => {
            setShowLater(!showLater)
          }}
        >
          {showLater ? 'Hide what is for later' : `${String(later.length)} later today — show`}
        </button>
      )}

      {/*
        Both folds sit below everything the day asks for, in the order
        they are least likely to be wanted: what is finished, then what
        is not for today at all. Neither is banded by part of day — a
        fold is already a lid, and a whole second axis of headings inside
        one is structure nobody asked to see. They are still grouped by
        category, and `homeOrGroup` is what keeps a done chore and a done
        habit labelled House under one heading here too.
      */}
      {showingRest && done.length + goalsDone.length > 0 && (
        <div className="mt-2">
          {done.length > 0 && <DoneRows rows={done} />}
          {goalsDone.length > 0 && (
            <Card className="divide-ink-800 mt-2 divide-y py-0">
              {goalsDone.map((status) => (
                <GoalRow key={status.item.id} status={status} />
              ))}
            </Card>
          )}
        </div>
      )}

      {/*
        Own habits only, so nothing here is filed elsewhere — but it
        takes `homeOrGroup` all the same, because the rule is the
        screen's rather than the list's and a copy that differed would
        only be waiting for the day this list stops being own-only.
      */}
      {showingRest && otherDays.length > 0 && (
        <div className="mt-2">
          <GroupedDailies
            views={otherDays}
            categoryOf={homeOrGroup}
            render={(view, part) => <DailyRow view={view} part={part} />}
          />
        </div>
      )}

      {/*
        A deadline four days out is not what today asks, so it folds with
        the rest of what the day is not asking — but it stays on the
        screen, because being able to see it without opening the quest is
        the entire reason the agenda exists.
      */}
      {soon.length > 0 && (
        <Fold summary={`${counted(soon.length, 'thing', 'things')} coming up`}>
          <Card className="divide-ink-800 divide-y py-0">
            {soon.map((item) => (
              <AgendaRow key={item.id} item={item} />
            ))}
          </Card>
        </Fold>
      )}
    </>
  )
}
