import { useQuery } from '@tanstack/react-query'
import { History, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useServices, useSettings } from '@/app/context'
import type { WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { remainingSets, totalTonnage, totalWorkingSets } from '@/domain/logging/workout-log'
import type { WeightUnit } from '@/domain/units/weight'
import { Badge, Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { splitDayLabel } from '@/features/train/useNextSession'
import { cn } from '@/lib/cn'

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
  const abandoned = sessions.length - completed

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
            {completed} logged{abandoned > 0 ? ` · ${String(abandoned)} abandoned` : ''}
          </span>
        }
      />
      <ul className="-mx-2 space-y-1">
        {(showAll ? sessions : sessions.slice(0, RECENT)).map((workout) => (
          <li key={workout.id}>
            <SessionRow
              workout={workout}
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
      {sessions.length > RECENT && (
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
            <span className="truncate">{name}</span>
            {/*
              Said in a word rather than left to the set count: a two-set
              squat day otherwise reads as a bad session rather than an
              interrupted one.
            */}
            {workout.status === 'abandoned' && <Badge tone="warn">Abandoned</Badge>}
          </p>
          <p className="text-ink-500 numeric mt-0.5 text-xs">
            {when.toLocaleDateString(undefined, { weekday: 'long' })} · {sets}{' '}
            {sets === 1 ? 'set' : 'sets'} · {Math.round(totalTonnage(workout)).toLocaleString()}{' '}
            {units}
          </p>
        </div>

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
