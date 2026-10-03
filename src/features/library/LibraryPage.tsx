import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useServices } from '@/app/context'
import { MUSCLE_GROUP_LABELS } from '@/domain/exercises/taxonomy'
import type { ExerciseId } from '@/domain/ids/ids'
import { LIBRARY_WEEKS, libraryShelves, type LibraryRow } from '@/domain/logging/library'
import { toDayKey } from '@/domain/time/day'
import { MorphText } from '@/components/shared/MorphText'
import { morphName } from '@/components/shared/morph'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/shared/primitives'
import { useExercises, useProgram, useRecentWorkouts } from '@/features/train/hooks'
import { cn } from '@/lib/cn'

type Show = 'all' | 'week' | 'done'

const SHOWS: readonly { readonly id: Show; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'week', label: 'In your week' },
  { id: 'done', label: 'Done before' },
]

/** Sets in a week that fill a bar to the top; more is still full. */
const FULL_WEEK = 8

/**
 * Every exercise the app knows, shelved by the muscle it is for
 * (`libraryShelves`), each a link to its own page.
 *
 * **A row's mark is a barcode of its last twelve weeks**: a thin bar per
 * week, as tall as the working sets done in it, lit in the accent for
 * exercises the routine names. It answers "have I been doing this" for a
 * whole shelf at a glance — the thing somebody looking for a swap or an
 * old favourite actually wants — and it is a different shape from every
 * other chart in the app on purpose.
 */
export function LibraryPage() {
  const today = toDayKey(useServices().clock.now())
  const exercises = useExercises()
  const workouts = useRecentWorkouts(1000)
  const program = useProgram()
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')

  if (exercises.data === undefined || workouts.data === undefined) {
    return <PageHeader title="Exercises" subtitle="Loading…" />
  }

  const scheduled = new Set<ExerciseId>(
    (program.data?.blocks[0]?.weeks[0]?.days ?? [])
      .flatMap((day) => day.slots)
      .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [])),
  )
  const all = libraryShelves(exercises.data, workouts.data, scheduled, today)
  const needle = query.trim().toLowerCase()
  const shelves = all.flatMap((shelf) => {
    const rows = shelf.rows.filter(
      (row) =>
        (show === 'all' ||
          (show === 'week' && row.inWeek) ||
          (show === 'done' && row.lastDone !== undefined)) &&
        (needle === '' ||
          row.exercise.name.toLowerCase().includes(needle) ||
          MUSCLE_GROUP_LABELS[shelf.muscle].toLowerCase().includes(needle)),
    )
    return rows.length === 0 ? [] : [{ ...shelf, rows }]
  })
  const total = all.reduce((sum, shelf) => sum + shelf.rows.length, 0)

  return (
    <div className="mx-auto max-w-4xl pb-8">
      <PageHeader
        title="Exercises"
        subtitle={`${String(total)} in the library · ${String(scheduled.size)} in your week`}
      />
      <div className="mb-4 space-y-2">
        <label className="relative block">
          <span className="sr-only">Search exercises</span>
          <Search
            size={14}
            className="text-ink-500 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            placeholder="Search an exercise or a muscle"
            onChange={(event) => {
              setQuery(event.target.value)
            }}
            className="bg-ink-900 border-ink-800 text-ink-100 placeholder:text-ink-500 w-full rounded-lg border py-2 pr-3 pl-8 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which exercises">
          {SHOWS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={show === option.id}
              onClick={() => {
                setShow(option.id)
              }}
              className={cn(
                'tap-target rounded-full border px-3 text-xs font-medium transition-colors',
                show === option.id
                  ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                  : 'border-ink-800 text-ink-300 hover:border-ink-700',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {shelves.length === 0 ? (
        <Card>
          <p className="text-ink-300 text-sm">Nothing matches.</p>
        </Card>
      ) : (
        <div className="columns-1 gap-3 sm:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
          {shelves.map((shelf) => (
            <Card key={shelf.muscle} className="p-3.5">
              <h2 className="text-ink-500 mb-2 flex items-baseline justify-between text-sm">
                {MUSCLE_GROUP_LABELS[shelf.muscle]}
                <span className="numeric text-ink-600 text-xs">{shelf.rows.length}</span>
              </h2>
              <ul className="divide-ink-800/60 divide-y">
                {shelf.rows.map((row) => (
                  <ShelfRow key={row.exercise.id} row={row} today={today} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function ShelfRow({ row, today }: { readonly row: LibraryRow; readonly today: string }) {
  const to = `/exercise/${row.exercise.id}`
  const sets = row.weeks.reduce((sum, week) => sum + week, 0)
  return (
    <li>
      <Link
        viewTransition
        to={to}
        className="hover:bg-ink-850 -mx-1.5 flex min-h-11 items-center gap-3 rounded-md px-1.5 py-1.5"
      >
        <span className="min-w-0 flex-1">
          <MorphText
            to={to}
            name={morphName('exercise', row.exercise.id)}
            className="text-ink-100 block truncate text-sm"
          >
            {row.exercise.name}
          </MorphText>
          <span className="text-ink-500 block text-[0.7rem]">
            {row.inWeek && <span className="text-accent-400">In your week · </span>}
            {row.lastDone === undefined ? 'Not done yet' : `Done ${lastLabel(row.lastDone, today)}`}
          </span>
        </span>
        <span
          className="flex h-6 shrink-0 items-end gap-[2px]"
          role="img"
          aria-label={`${String(sets)} working sets in the last ${String(LIBRARY_WEEKS)} weeks`}
        >
          {row.weeks.map((week, at) => (
            <span
              key={at}
              className={cn(
                'w-[3px] rounded-full',
                week === 0 ? 'bg-ink-800' : row.inWeek ? 'bg-accent-500' : 'bg-ink-300',
              )}
              style={{
                height:
                  week === 0
                    ? '3px'
                    : `${String(30 + (70 * Math.min(week, FULL_WEEK)) / FULL_WEEK)}%`,
              }}
            />
          ))}
        </span>
      </Link>
    </li>
  )
}

function lastLabel(day: string, today: string): string {
  const days = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${String(days)} days ago`
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
  })
}
