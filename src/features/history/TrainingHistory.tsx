import { useQuery } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useServices, useSettings } from '@/app/context'
import type { WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { remainingSets, totalTonnage, totalWorkingSets } from '@/domain/logging/workout-log'
import type { WeightUnit } from '@/domain/units/weight'
import { formatLoad } from '@/domain/units/weight'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'

import { useDeleteWorkout, useReopenWorkout } from './hooks'

/**
 * Every session logged, newest first, with the ways to take one back.
 *
 * **One card with divided rows, not a card per session.** Each row was a
 * full card of its own, so on a monitor eight sessions were eight
 * full-width slabs — the heaviest thing on a page whose job is the next
 * session. The weekly volume that used to open this section is the
 * radar in `WeekCard` now.
 */
/** How many sessions show before "Show all", newest first. */
const RECENT = 8

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
   * **The same window the XP tally reads.** This was fifty, and the
   * header below counts what came back — so four months of a six-day week
   * read as "50 sessions logged", a total that was really a page size.
   */
  const workouts = useQuery({
    queryKey: ['workouts', 'recent', 500],
    queryFn: () => services.workouts.recent(500),
  })

  const completed = (workouts.data ?? []).filter((workout) => workout.status === 'completed')

  /*
   * Abandoned sessions are listed too, and that is a correction.
   *
   * Walking away from a session mid-way keeps the record precisely
   * because the work in it was real — three sets before the gym closed
   * are three sets, and everything that reads history already treats
   * them that way. The "last time" suggestion on the Train screen offers
   * them as the number to beat, and the e1RM estimate counts them.
   *
   * This screen was the exception, and it made the app look broken in a
   * specific way: a lifter who logged a top set and abandoned the rest
   * was shown 305 lb as their last squat and an empty history in the same
   * breath. Worse, a record nothing lists is a record nothing can delete.
   *
   * They are marked rather than blended in — an abandoned session is not
   * a session you finished, and the badge is what stops the list implying
   * otherwise.
   */
  const sessions = (workouts.data ?? []).filter(
    (workout) => workout.status === 'completed' || workout.status === 'abandoned',
  )

  const abandoned = (workouts.data ?? []).filter((workout) => workout.status === 'abandoned')

  return (
    <div>
      {/*
        Counted separately, because they are different claims. A finished
        session is one you completed; an abandoned one is work that
        happened inside a session you walked away from. Adding them into a
        single total would overstate the first.

        **Capped, because this list now shares a page.** It was a screen of
        its own, where a long list was the point; on the one page it would
        bury everything below it after a few months of training. The
        newest few show and the rest are one press away.
      */}
      <Section
        title="Sessions"
        description={`${String(completed.length)} logged${abandoned.length > 0 ? ` · ${String(abandoned.length)} abandoned` : ''}`}
      >
        {workouts.data === undefined ? (
          <Card>
            <p className="text-ink-500 text-sm">Loading…</p>
          </Card>
        ) : sessions.length === 0 ? (
          <Empty title="Nothing logged yet">
            <p>Finish a session and it will appear here.</p>
          </Empty>
        ) : (
          <Card className="p-0 lg:p-0">
            <ul className="divide-ink-800 divide-y">
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
                    // program back past a session already trained would
                    // have the lifter repeat days and file logs out of
                    // order. The use-case refuses it too; this stops the
                    // button appearing where it would.
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
          </Card>
        )}
        {!showAll && sessions.length > RECENT && (
          <Button
            variant="ghost"
            full
            className="mt-2"
            onClick={() => {
              setShowAll(true)
            }}
          >
            Show all {sessions.length}
          </Button>
        )}
      </Section>
    </div>
  )
}

/**
 * One session, and the way to take it back out.
 *
 * The delete is a two-tap confirm rather than a modal. A dialog is the
 * conventional answer and the wrong one here: this list is read on a
 * phone, one-handed, and a sheet that covers the row being deleted asks
 * the lifter to confirm from memory. Expanding the row keeps what is
 * about to be removed — the title, the date, the set count — on screen
 * while the question is being asked.
 *
 * The confirm names the working sets it is about to destroy, because that
 * is the number that distinguishes the case this was built for (a
 * mis-tapped finish, nothing logged) from the case that should give
 * anyone pause (a real session, twenty sets in it).
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

  return (
    <div className="px-4 py-3 lg:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink-50 truncate text-sm font-medium">{workout.title}</p>
          <p className="text-ink-500 mt-0.5 text-xs">
            {formatDate(workout.date)} · {sets} sets · {formatLoad(totalTonnage(workout), units)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/*
            Said in a word rather than left to the set count. "Abandoned"
            is why the session is short, and without it a two-set squat day
            reads as a bad session rather than an interrupted one.
          */}
          {workout.status === 'abandoned' && <Badge tone="warn">Abandoned</Badge>}
          {workout.position !== undefined && (
            <Badge>
              C{workout.position.cycleNumber} W{workout.position.weekIndex + 1}
            </Badge>
          )}
          {/*
            Offered only on the session that can actually take it: the
            most recent one, with sets still pending. Anywhere else the
            button would be a promise the use-case refuses, and a control
            that explains itself by failing is worse than no control.
          */}
          {!confirming && canReopen && unfinished > 0 && (
            <button
              type="button"
              onClick={onReopen}
              disabled={pending}
              aria-label={`Reopen ${workout.title} from ${formatDate(workout.date)} — ${String(unfinished)} sets left`}
              className="tap-target text-ink-500 hover:text-accent-400 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50"
            >
              <RotateCcw size={16} aria-hidden />
            </button>
          )}
          {!confirming && (
            <button
              type="button"
              onClick={onAskDelete}
              aria-label={`Delete ${workout.title} from ${formatDate(workout.date)}`}
              className="tap-target text-ink-500 hover:text-bad-500 flex items-center justify-center rounded-lg transition-colors"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {confirming && (
        <div className="border-ink-800 mt-3 border-t pt-3">
          <p className="text-ink-300 text-xs">
            Delete this session?{' '}
            {sets === 0 ? (
              <span className="text-ink-500">Nothing was logged in it.</span>
            ) : (
              <span className="text-ink-500">
                {sets} logged set{sets === 1 ? '' : 's'} will go with it.
              </span>
            )}{' '}
            This cannot be undone, and it does not move your program.
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

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
