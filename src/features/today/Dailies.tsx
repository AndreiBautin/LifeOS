import { Archive, Check, Flame, Home, Plus } from 'lucide-react'
import { useState } from 'react'

import type { DailyView } from '@/application/use-cases/dailies/dailies'
import { Button, Card, Empty } from '@/components/shared/primitives'
import type { Cadence } from '@/domain/dailies/daily'

import { BASE, type RecordHome } from '@/domain/base/base'
import {
  useAddDaily,
  useMoveDailyHome,
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
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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

function DailyRow({ view }: { readonly view: DailyView }) {
  const keep = useKeepToday()
  const undo = useUndoToday()
  const retire = useRetireDaily()
  const moveHome = useMoveDailyHome()
  const [confirming, setConfirming] = useState(false)

  const { daily, doneToday, expectedToday } = view

  return (
    <div className="flex items-center gap-3 py-2">
      <button
        type="button"
        aria-label={doneToday ? `Untick ${daily.title}` : `Tick ${daily.title}`}
        aria-pressed={doneToday}
        className={[
          'tap-target grid size-9 shrink-0 place-items-center rounded-lg border transition-colors',
          doneToday
            ? 'border-good-500 bg-good-500/15 text-good-500'
            : 'border-ink-700 text-ink-700 hover:border-ink-500',
        ].join(' ')}
        onClick={() => {
          if (doneToday) undo.mutate(daily.id)
          else keep.mutate(daily.id)
        }}
      >
        {doneToday && <Check size={18} aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={[
            'truncate text-sm',
            doneToday ? 'text-ink-500 line-through' : 'text-ink-50 font-medium',
          ].join(' ')}
        >
          {daily.title}
        </p>
        <p className="text-ink-600 text-xs">
          {cadenceLabel(daily.cadence)}
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

  const toggle = (day: number): void => {
    setDays(days.includes(day) ? days.filter((one) => one !== day) : [...days, day])
  }

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          add.mutate(
            {
              title,
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

export function Dailies() {
  const dailies = useDailies()
  const [adding, setAdding] = useState(false)

  const views = dailies.data ?? []
  const left = views.filter((view) => view.dueToday).length

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-ink-500 text-sm">
          {views.length === 0
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

      {views.length === 0 ? (
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
    </>
  )
}
