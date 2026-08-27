import { Archive, Check, Flame, Plus } from 'lucide-react'
import { useState } from 'react'

import type { DailyView } from '@/application/use-cases/dailies/dailies'
import { Button, Card, Empty } from '@/components/shared/primitives'
import type { Cadence } from '@/domain/dailies/daily'

import {
  useAddDaily,
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

function cadenceLabel(cadence: Cadence): string {
  if (cadence.kind === 'every-day') return 'Every day'
  if (cadence.days.length === 0) return 'No days set'

  return [...cadence.days]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day] ?? '?')
    .join(' ')
}

function DailyRow({ view }: { readonly view: DailyView }) {
  const keep = useKeepToday()
  const undo = useUndoToday()
  const retire = useRetireDaily()
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

function AddDaily({ onDone }: { readonly onDone: () => void }) {
  const add = useAddDaily()
  const [title, setTitle] = useState('')
  const [days, setDays] = useState<readonly number[]>([])

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
              cadence: days.length === 0 ? { kind: 'every-day' } : { kind: 'days-of-week', days },
            },
            { onSuccess: onDone },
          )
        }}
      >
        <input
          className={FIELD}
          value={title}
          aria-label="New daily"
          placeholder="Something you mean to do daily"
          onChange={(event) => {
            setTitle(event.target.value)
          }}
        />

        <div>
          <span className="text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase">
            Which days · none for every day
          </span>
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
                  setDays(
                    days.includes(index) ? days.filter((one) => one !== index) : [...days, index],
                  )
                }}
              >
                {label}
              </button>
            ))}
          </div>
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
