import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import type { Exercise } from '@/domain/exercises/exercise'
import {
  DEFAULT_MUSCLE_VOLUMES,
  DEFAULT_SETS_PER_SESSION,
  weeklySetsFor,
} from '@/domain/volume/levels'
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import {
  loggedVolume,
  remainingSets,
  totalTonnage,
  totalWorkingSets,
} from '@/domain/logging/workout-log'
import type { WeightUnit } from '@/domain/units/weight'
import { formatLoad } from '@/domain/units/weight'
import { displaySets, sumVolume, type VolumeMap } from '@/domain/volume/accounting'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'

import { useDeleteWorkout, useReopenWorkout } from './hooks'

/**
 * Training history, and the weekly volume that comes out of it.
 *
 * The volume chart is StrengthFlow's best analytic idea, corrected in one
 * important way: it is counted in *hard sets*, by the same rules the
 * planner uses, rather than in reps on an axis labelled volume. That is
 * what makes it comparable to the landmarks, which is the only reason to
 * show it.
 */
export function HistoryPage() {
  const services = useServices()
  const { settings } = useSettings()
  const deleteWorkout = useDeleteWorkout()
  const reopenWorkout = useReopenWorkout()
  const navigate = useNavigate()

  /*
   * Which row is asking to be confirmed, if any.
   *
   * Held here rather than per row so that opening one confirmation closes
   * any other: two rows both showing a red "Delete" at once, in a list
   * where every row looks alike, is how the wrong session gets removed.
   */
  const [confirming, setConfirming] = useState<WorkoutId | undefined>(undefined)

  const workouts = useQuery({
    queryKey: ['workouts', 'recent', 50],
    queryFn: () => services.workouts.recent(50),
  })
  const exercises = useQuery({ queryKey: ['exercises'], queryFn: () => services.exercises.all() })

  const library = exercises.data ?? []
  const lookup = (id: ExerciseId): Exercise | undefined =>
    library.find((exercise) => exercise.id === id)

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

  const thisWeek = sessions.filter((workout) => isWithinDays(workout.date, 7))

  const weekVolume: VolumeMap | undefined =
    thisWeek.length > 0
      ? sumVolume(thisWeek.map((workout) => loggedVolume(workout, lookup)))
      : undefined

  return (
    <div>
      {/*
        Counted separately, because they are different claims. A finished
        session is one you completed; an abandoned one is work that
        happened inside a session you walked away from. Adding them into a
        single total would overstate the first, and leaving the second out
        entirely is what made this screen look empty.
      */}
      <PageHeader
        title="History"
        subtitle={
          <>
            {completed.length} session{completed.length === 1 ? '' : 's'} logged
            {abandoned.length > 0 && ` · ${String(abandoned.length)} abandoned`}
          </>
        }
      />

      {weekVolume !== undefined && (
        <Section title="This week" description="Hard sets against your landmarks">
          <Card>
            <ul className="space-y-2">
              {(Object.keys(weekVolume) as MuscleGroup[])
                .filter((muscle) => weekVolume[muscle] > 0)
                .sort((a, b) => weekVolume[b] - weekVolume[a])
                .map((muscle) => {
                  /*
                    The targets are constants now rather than settings —
                    the volume customisation was gutted — so this reads
                    the same table the assembler builds from instead of a
                    copy the lifter could edit.
                  */
                  const target = weeklySetsFor(
                    DEFAULT_MUSCLE_VOLUMES[muscle],
                    DEFAULT_SETS_PER_SESSION,
                    false,
                  )
                  const done = weekVolume[muscle]
                  return (
                    <li key={muscle}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-ink-300">{MUSCLE_GROUP_LABELS[muscle]}</span>
                        <span className="numeric text-ink-500 text-xs">
                          {displaySets(done)}
                          {target > 0 ? ` / ${String(target)}` : null}
                        </span>
                      </div>
                      <VolumeBar done={done} target={target} />
                    </li>
                  )
                })}
            </ul>
            <p className="text-ink-500 mt-3 text-xs">
              The band is your minimum effective to maximum adaptive volume. Past the right edge is
              your maximum recoverable — a week or two above it is a choice, a month is a stall.
            </p>
          </Card>
        </Section>
      )}

      <Section title="Sessions">
        {workouts.data === undefined ? (
          <Card>
            <p className="text-ink-500 text-sm">Loading…</p>
          </Card>
        ) : sessions.length === 0 ? (
          <Empty title="Nothing logged yet">
            <p>Finish a session and it will appear here.</p>
          </Empty>
        ) : (
          <ul className="space-y-2">
            {sessions.map((workout) => (
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
                        if (result.kind === 'reopened') void navigate('/train')
                      },
                    })
                  }}
                />
              </li>
            ))}
          </ul>
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
    <Card className="p-3">
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
    </Card>
  )
}

/**
 * A bar showing where the week's volume sits inside the landmark band.
 *
 * Deliberately not a chart library. One `div` with three coloured zones
 * communicates "under, in, or over" faster than a plotted series, and it
 * is the only question a lifter asks of this number.
 */
/**
 * What was done against what was asked.
 *
 * This drew a *band* — MEV to MAV shaded, MRV as the scale — because a
 * target used to be a point inside a range and landing anywhere in that
 * range was the goal. There is no band now: there is a number, and the
 * only questions are whether you reached it and how far past you went.
 *
 * A muscle with no target still gets a bar, because the sets were
 * genuinely performed and hiding them would make the week look emptier
 * than it was. It simply has nothing to be measured against.
 */
function VolumeBar({ done, target }: { readonly done: number; readonly target: number }) {
  const scale = Math.max(target, done) || 1
  const pct = (value: number): number => Math.min(100, (value / scale) * 100)

  const tone = target <= 0 ? 'bg-ink-700' : done < target ? 'bg-warn-500' : 'bg-good-500'

  return (
    <div className="bg-ink-850 relative h-2 overflow-hidden rounded-full">
      {target > 0 && (
        <div
          className="bg-ink-800 absolute inset-y-0"
          style={{ left: `${String(pct(target))}%`, right: 0 }}
          aria-hidden
        />
      )}
      <div
        className={`${tone} absolute inset-y-0 left-0`}
        style={{ width: `${String(pct(done))}%` }}
      />
    </div>
  )
}

function isWithinDays(isoDate: string, days: number): boolean {
  const then = new Date(`${isoDate}T00:00:00`).getTime()
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return then >= cutoff
}

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
