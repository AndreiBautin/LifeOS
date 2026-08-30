import { Archive, Check, Flame, Home, Pencil, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'

import type { DailyView } from '@/application/use-cases/dailies/dailies'
import { Button, Card, Empty } from '@/components/shared/primitives'
import type { Cadence, Daily } from '@/domain/dailies/daily'

import { BASE, UPKEEP, type RecordHome } from '@/domain/base/base'
import { WEEKDAY_LABELS, WEEKDAY_NAMES } from '@/domain/time/day'
import {
  PART_OF_DAY_LABELS,
  PARTS_OF_DAY,
  partOfDayAt,
  type PartOfDay,
} from '@/domain/dailies/daily'
import { useServices } from '@/app/context'
import {
  useAddDaily,
  useDueElsewhere,
  useMoveDailyHome,
  useRenameDaily,
  useDailies,
  useKeepToday,
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
  daily,
  onDone,
}: {
  readonly daily: Daily
  readonly onDone: () => void
}) {
  const rename = useRenameDaily()
  const [title, setTitle] = useState(daily.title)

  return (
    <form
      className="flex items-center gap-2 py-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (title.trim() === '') return
        rename.mutate({ id: daily.id, title }, { onSuccess: onDone })
      }}
    >
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
    </form>
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

function DailyRow({ view }: { readonly view: DailyView }) {
  // From the record, so a chore shown on Today still pays as a chore.
  const keep = useKeepToday(view.daily.belongsTo)
  const nowPart = partOfDayAt(useServices().clock.now())
  const undo = useUndoToday()
  const retire = useRetireDaily()
  const moveHome = useMoveDailyHome()
  const [confirming, setConfirming] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const { daily, doneToday, expectedToday, doneCount, needed } = view

  if (renaming) {
    return (
      <RenameDaily
        daily={daily}
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
          if (doneToday) undo.mutate(daily.id)
          else keep.mutate(daily.id)
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
          {daily.partOfDay !== undefined && (
            <span className={daily.partOfDay === nowPart ? 'text-accent-400' : undefined}>
              {PART_OF_DAY_LABELS[daily.partOfDay]}
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
        Off to Base, for the hoovering somebody added here before noticing
        it was house work. A move rather than a re-create — the days it
        has been kept on are the whole value of the record — and it comes
        straight back the same way from the Base screen.
      */}
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Move ${daily.title} to Base`}
        disabled={moveHome.isPending}
        onClick={() => {
          moveHome.mutate({ id: daily.id, home: BASE })
        }}
      >
        <Home size={16} aria-hidden />
      </Button>

      {/*
        Retire rather than delete: the days it was kept survive, and eighty
        days of a habit you have finished with is a thing that happened.
      */}
      <Button
        size="sm"
        variant={confirming ? 'danger' : 'ghost'}
        aria-label={confirming ? `Confirm retiring ${daily.title}` : `Retire ${daily.title}`}
        onClick={() => {
          if (confirming) retire.mutate(daily.id)
          else setConfirming(true)
        }}
      >
        {confirming ? 'Sure?' : <Archive size={16} aria-hidden />}
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
export function AddDaily({
  onDone,
  home,
  placeholder = 'Something you mean to do daily',
}: {
  readonly onDone: () => void
  readonly home?: RecordHome
  readonly placeholder?: string
}) {
  const add = useAddDaily(home)
  const [title, setTitle] = useState('')
  const [days, setDays] = useState<readonly number[]>([])
  const [monthly, setMonthly] = useState(false)
  const [times, setTimes] = useState('1')
  const [part, setPart] = useState<PartOfDay | ''>('')

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
              ...(part === '' ? {} : { partOfDay: part }),
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
          When in the day it belongs, which is a third question again:
          which days, how many on one of them, and whereabouts in it.
          Coarse because nothing can ring — see `partOfDay`.
        */}
        <div className="flex gap-1">
          {(['', ...PARTS_OF_DAY] as const).map((one) => (
            <button
              key={one === '' ? 'any' : one}
              type="button"
              aria-pressed={part === one}
              className={[
                'tap-target flex-1 rounded-lg border px-2 text-xs font-medium',
                part === one
                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                  : 'border-ink-800 text-ink-500',
              ].join(' ')}
              onClick={() => {
                setPart(one)
              }}
            >
              {one === '' ? 'Any time' : PART_OF_DAY_LABELS[one]}
            </button>
          ))}
        </div>

        {/*
          How many times on each of those days. Separate from the cadence
          above because the two answer different questions — which days,
          and how many on one of them — and a habit done three times on
          weekdays needs both.
        */}
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
 * Recurring work that lives on another screen but is due on this one.
 *
 * Grouped by where it is filed rather than mixed in, which is the whole
 * reason chores were moved off Today in the first place: a flat list
 * buries the habits somebody chose under the ones the house and the body
 * simply require. Grouping keeps both true — everything due is visible,
 * and what you chose is still first.
 */
function DueElsewhere() {
  const due = useDueElsewhere()
  const views = due.data ?? []

  if (views.length === 0) return null

  const groups = [
    { home: BASE, label: 'House', to: '/base' },
    { home: UPKEEP, label: 'Upkeep', to: '/vitals' },
  ].map((group) => ({
    ...group,
    rows: views.filter((view) => view.daily.belongsTo === group.home),
  }))

  return (
    <div className="mt-3 space-y-3">
      {groups
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <div key={group.home}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-ink-700 text-xs tracking-wide uppercase">{group.label}</span>
              <Link to={group.to} className="text-ink-700 hover:text-ink-500 text-xs">
                all →
              </Link>
            </div>
            <Card className="divide-ink-800 divide-y py-0">
              {group.rows.map((view) => (
                <DailyRow key={view.daily.id} view={view} />
              ))}
            </Card>
          </div>
        ))}
    </div>
  )
}

export function Dailies() {
  const dailies = useDailies()
  const due = useDueElsewhere()
  const [adding, setAdding] = useState(false)

  const views = dailies.data ?? []
  /*
   * Counted across every home, because the sentence is about the day and
   * not about this section. "3 left today" that ignored the bins would
   * be answering a question nobody asked.
   */
  const left =
    views.filter((view) => view.dueToday).length +
    (due.data ?? []).filter((view) => view.dueToday).length

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-ink-500 text-sm">
          {views.length === 0 && (due.data ?? []).length === 0
            ? 'Nothing yet.'
            : left === 0
              ? 'All done for today.'
              : `${left.toString()} left today`}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setAdding(!adding)
          }}
        >
          {adding ? 'Close' : 'Add'}
        </Button>
      </div>

      {adding && (
        <AddDaily
          onDone={() => {
            setAdding(false)
          }}
        />
      )}

      {views.length === 0 && (due.data ?? []).length > 0 ? null : views.length === 0 ? (
        <Empty title="No dailies yet">
          A daily here is a checkbox and a streak. It cannot ring — nothing in a web app on iOS can
          — so it earns its place by being the first thing on this screen.
        </Empty>
      ) : (
        <Card className="divide-ink-800 divide-y py-0">
          {views.map((view) => (
            <DailyRow key={view.daily.id} view={view} />
          ))}
        </Card>
      )}

      <DueElsewhere />
    </>
  )
}
