import { useQuery } from '@tanstack/react-query'
import { MorphText } from '@/components/shared/MorphText'
import { morphName } from '@/components/shared/morph'
import { History, RotateCcw, Search, Star, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useServices, useSettings } from '@/app/context'
import type { WorkoutId } from '@/domain/ids/ids'
import { sessionRecords } from '@/domain/logging/records'
import {
  dayNameOf,
  filterHistory,
  isFiltering,
  NO_FILTER,
  type HistoryFilter,
} from '@/domain/logging/history-filter'
import { useExercises } from '@/features/train/hooks'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { remainingSets, totalTonnage, totalWorkingSets } from '@/domain/logging/workout-log'
import type { WeightUnit } from '@/domain/units/weight'
import { Badge, Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { splitDayLabel } from '@/features/train/useNextSession'
import { cn } from '@/lib/cn'
import { Link } from 'react-router-dom'

import { useDeleteWorkout, useReopenWorkout } from './hooks'

/**
 * The sessions logged, newest first, with the ways to take one back.
 *
 * **A card in the grid, not a section under it.** It was a full-width
 * list — first a card per session, then one card of rows — and on a
 * monitor either was a stack of near-empty stripes the width of the page:
 * _"same issue as the weekly volume graph"_. As a card it sits with the
 * rest of the dashboard, and each row leads with a date tile so the list
 * reads as a calendar of what was done rather than as text.
 *
 * **The weekday leaves the title.** The routine names a session "Thursday
 * — Push B", and the tile beside it already says which day it was, so
 * the row says "Push B".
 */
/** How many sessions show before "Show all", newest first. */
const RECENT = 6

export function TrainingHistory() {
  const services = useServices()
  const { settings } = useSettings()
  const deleteWorkout = useDeleteWorkout()
  const reopenWorkout = useReopenWorkout()
  const [showAll, setShowAll] = useState(false)
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER)
  const exercises = useExercises()

  /*
   * Which row is asking to be confirmed, if any.
   *
   * Held here rather than per row so that opening one confirmation closes
   * any other: two rows both showing a red "Delete" at once, in a list
   * where every row looks alike, is how the wrong session gets removed.
   */
  const [confirming, setConfirming] = useState<WorkoutId | undefined>(undefined)

  /*
   * **The same window the training grid reads.** This was fifty, and the
   * header counted what came back — so four months of a six-day week read
   * as "50 sessions logged", a total that was really a page size.
   */
  const workouts = useQuery({
    queryKey: ['workouts', 'recent', 500],
    queryFn: () => services.workouts.recent(500),
  })

  /*
   * Abandoned sessions are listed too, and marked.
   *
   * Walking away from a session keeps the record precisely because the
   * work in it was real, and everything else that reads history treats it
   * that way. A record nothing lists is also a record nothing can delete.
   * The badge is what stops the list implying it was finished.
   */
  const sessions = (workouts.data ?? []).filter(
    (workout) => workout.status === 'completed' || workout.status === 'abandoned',
  )
  const completed = sessions.filter((workout) => workout.status === 'completed').length
  // Every record in the window at once, oldest first, so each session is
  // judged against the ones before it rather than the whole list.
  const records = useMemo(() => sessionRecords(workouts.data ?? []), [workouts.data])
  const abandoned = sessions.length - completed

  /*
   * **Search and chips, and the fold steps aside while either is on**: a
   * search is a request for what matches, and folding matches away
   * behind "Show all" would be the list arguing with its own box. The day
   * chips are the days this history actually holds, most recent first.
   */
  const filtering = isFiltering(filter)
  const nameOf = (id: string): string =>
    exercises.data?.find((exercise) => exercise.id === id)?.name ?? id
  const matches = filtering
    ? filterHistory(sessions, filter, nameOf, (id) => records.get(id)?.length ?? 0)
    : sessions
  const days = [...new Set(sessions.map((workout) => dayNameOf(workout.title)))].slice(0, 6)
  const shown = filtering || showAll ? matches : matches.slice(0, RECENT)

  if (workouts.data === undefined) return null

  if (sessions.length === 0) {
    return (
      <Empty title="Nothing logged yet">
        <p>Finish a session and it will appear here.</p>
      </Empty>
    )
  }

  return (
    <Card>
      <CardHeading
        icon={<History size={16} aria-hidden />}
        title="Recent sessions"
        action={
          <span className="text-ink-500 numeric text-xs">
            {filtering
              ? `${String(matches.length)} of ${String(sessions.length)}`
              : `${String(completed)} logged${abandoned > 0 ? ` · ${String(abandoned)} abandoned` : ''}`}
          </span>
        }
      />
      <HistoryFilters filter={filter} days={days} onChange={setFilter} />
      {matches.length === 0 && (
        <p className="text-ink-500 py-4 text-center text-sm">
          Nothing matches.{' '}
          <button
            type="button"
            className="text-accent-400 underline-offset-2 hover:underline"
            onClick={() => {
              setFilter(NO_FILTER)
            }}
          >
            Clear
          </button>
        </p>
      )}
      <ul className="-mx-2 space-y-1">
        {shown.map((workout) => (
          <li key={workout.id}>
            <SessionRow
              workout={workout}
              records={records.get(workout.id)?.length ?? 0}
              units={settings.units}
              confirming={confirming === workout.id}
              pending={deleteWorkout.isPending}
              onAskDelete={() => {
                setConfirming(workout.id)
              }}
              onCancel={() => {
                setConfirming(undefined)
              }}
              onConfirm={() => {
                deleteWorkout.mutate(workout.id, {
                  onSuccess: () => {
                    setConfirming(undefined)
                  },
                })
              }}
              // Only the newest session can be reopened — rolling the
              // program back past a session already trained would have the
              // lifter repeat days and file logs out of order. The use-case
              // refuses it too; this stops the button appearing where it
              // would.
              canReopen={workout.id === sessions[0]?.id}
              onReopen={() => {
                reopenWorkout.mutate(workout.id, {
                  onSuccess: (result) => {
                    if (result.kind === 'reopened') window.scrollTo({ top: 0 })
                  },
                })
              }}
            />
          </li>
        ))}
      </ul>
      {!filtering && sessions.length > RECENT && (
        <Button
          variant="ghost"
          full
          className="mt-2"
          onClick={() => {
            setShowAll(!showAll)
          }}
        >
          {showAll ? 'Show fewer' : `Show all ${String(sessions.length)}`}
        </Button>
      )}
    </Card>
  )
}

/**
 * The search box on a row of its own — a field sharing a row with other
 * controls at 375 is the defect this codebase has shipped four times —
 * and the chips under it, wrapping rather than scrolling.
 */
function HistoryFilters({
  filter,
  days,
  onChange,
}: {
  readonly filter: HistoryFilter
  readonly days: readonly string[]
  readonly onChange: (next: (current: HistoryFilter) => HistoryFilter) => void
}) {
  const chip = (active: boolean) =>
    cn(
      'tap-target rounded-full border px-3 text-xs font-medium transition-colors',
      active
        ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
        : 'border-ink-800 text-ink-300 hover:border-ink-700',
    )
  return (
    <div className="mb-3 space-y-2">
      <label className="relative block">
        <span className="sr-only">Search sessions</span>
        <Search
          size={14}
          className="text-ink-500 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          aria-hidden
        />
        <input
          type="search"
          value={filter.query}
          placeholder="Search a day, a lift, a note"
          onChange={(event) => {
            const query = event.target.value
            onChange((current) => ({ ...current, query }))
          }}
          className="bg-ink-900 border-ink-800 text-ink-100 placeholder:text-ink-500 w-full rounded-lg border py-2 pr-3 pl-8 text-sm"
        />
      </label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter sessions">
        {days.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={filter.day === day}
            className={chip(filter.day === day)}
            onClick={() => {
              onChange((current) => ({ ...current, day: current.day === day ? undefined : day }))
            }}
          >
            {day}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={filter.recordsOnly}
          className={cn(chip(filter.recordsOnly), 'inline-flex items-center gap-1')}
          onClick={() => {
            onChange((current) => ({ ...current, recordsOnly: !current.recordsOnly }))
          }}
        >
          <Star size={12} aria-hidden />
          Records
        </button>
      </div>
    </div>
  )
}

/**
 * One session, and the way to take it back out.
 *
 * The delete is a two-tap confirm rather than a modal: this list is read
 * on a phone, one-handed, and a sheet covering the row being deleted asks
 * the lifter to confirm from memory. Expanding the row keeps what is
 * about to be removed on screen while the question is asked, and names
 * the sets that go with it — the number that separates a mis-tapped
 * finish from a real session.
 */
function SessionRow({
  workout,
  records,
  units,
  confirming,
  pending,
  onAskDelete,
  onCancel,
  onConfirm,
  onReopen,
  canReopen,
}: {
  readonly workout: WorkoutLog
  readonly records: number
  readonly units: WeightUnit
  readonly confirming: boolean
  readonly pending: boolean
  readonly onAskDelete: () => void
  readonly onCancel: () => void
  readonly onConfirm: () => void
  readonly onReopen: () => void
  readonly canReopen: boolean
}) {
  const sets = totalWorkingSets(workout)
  const unfinished = remainingSets(workout)
  const when = new Date(`${workout.date}T00:00:00`)
  const name = splitDayLabel(workout.title).name
  const described = `${name} on ${when.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`

  return (
    <div
      className={cn(
        'rounded-xl px-2 py-2 transition-colors',
        confirming ? 'bg-bad-500/5' : 'hover:bg-ink-800/40',
      )}
    >
      <div className="flex items-center gap-3">
        {/*
          The date and the name open the session; the two icon buttons
          beside them stay buttons. A row-wide link would put reopen and
          delete inside an anchor, which is invalid and swallows their taps.
        */}
        <Link
          viewTransition
          to={`/session/${workout.id}`}
          aria-label={`Open ${described}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <div
            className="border-ink-800 bg-ink-900/70 flex w-12 shrink-0 flex-col items-center rounded-lg border py-1.5"
            aria-hidden
          >
            <span className="text-ink-500 text-[0.65rem] font-semibold tracking-wider uppercase">
              {when.toLocaleDateString(undefined, { month: 'short' })}
            </span>
            <span className="numeric text-ink-50 text-lg leading-none font-semibold">
              {when.getDate()}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-ink-50 flex items-center gap-2 truncate text-sm font-medium">
              <MorphText
                to={`/session/${workout.id}`}
                name={morphName('session', workout.id)}
                className="truncate"
              >
                {name}
              </MorphText>
              {/*
              Said in a word rather than left to the set count: a two-set
              squat day otherwise reads as a bad session rather than an
              interrupted one.
            */}
              {workout.status === 'abandoned' && <Badge tone="warn">Abandoned</Badge>}
              {records > 0 && (
                <span
                  className="numeric inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[oklch(0.86_0.13_85)]"
                  aria-label={`${String(records)} personal record${records === 1 ? '' : 's'}`}
                >
                  <Star size={11} fill="currentColor" aria-hidden />
                  {records}
                </span>
              )}
            </p>
            <p className="text-ink-500 numeric mt-0.5 text-xs">
              {when.toLocaleDateString(undefined, { weekday: 'long' })} · {sets}{' '}
              {sets === 1 ? 'set' : 'sets'} · {Math.round(totalTonnage(workout)).toLocaleString()}{' '}
              {units}
            </p>
          </div>
        </Link>

        <div className="flex shrink-0 items-center">
          {/*
            Offered only on the session that can take it: the most recent,
            with sets still pending. Anywhere else it would be a promise the
            use-case refuses.
          */}
          {!confirming && canReopen && unfinished > 0 && (
            <button
              type="button"
              onClick={onReopen}
              disabled={pending}
              aria-label={`Reopen ${described} — ${String(unfinished)} sets left`}
              className="tap-target text-ink-500 hover:text-accent-400 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50"
            >
              <RotateCcw size={16} aria-hidden />
            </button>
          )}
          {!confirming && (
            <button
              type="button"
              onClick={onAskDelete}
              aria-label={`Delete ${described}`}
              className="tap-target text-ink-700 hover:text-bad-500 flex items-center justify-center rounded-lg transition-colors"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {confirming && (
        <div className="mt-3 pl-15">
          <p className="text-ink-300 text-xs">
            Delete this session?{' '}
            <span className="text-ink-500">
              {sets === 0
                ? 'Nothing was logged in it.'
                : `${String(sets)} logged set${sets === 1 ? '' : 's'} will go with it.`}{' '}
              This cannot be undone, and it does not move your program.
            </span>
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="danger" full disabled={pending} onClick={onConfirm}>
              {pending ? 'Deleting…' : 'Delete'}
            </Button>
            <Button variant="outline" full disabled={pending} onClick={onCancel}>
              Keep
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
