import { Check, ChevronDown, ChevronRight, Minus, Star } from 'lucide-react'
import { SessionNote } from './SessionNote'
import { ShareSession } from '@/features/share/ShareSession'
import { shareCardFrom } from '@/features/share/card-from'
import { MorphText } from '@/components/shared/MorphText'
import { morphName } from '@/components/shared/morph'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useSettings } from '@/app/context'
import type { EntryDetail } from '@/application/use-cases/training/session-detail'
import type { Exercise } from '@/domain/exercises/exercise'
import { asWorkoutId } from '@/domain/ids/ids'
import type { SessionRecord } from '@/domain/logging/records'
import type { LoggedSet } from '@/domain/logging/workout-log'
import { describePrescription } from '@/domain/programs/prescription'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Card } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'
import { useExercises } from '@/features/train/hooks'
import { SessionStats } from '@/features/train/SessionStats'
import { SessionTimeline } from '@/features/train/SessionTimeline'
import { splitDayLabel } from '@/features/train/useNextSession'
import { RecordChip } from '@/features/train/RecordChip'
import { VersusChip } from '@/features/train/VersusChip'

import { useSessionDetail } from './hooks'

/**
 * A past session, opened from the history list.
 *
 * It reads like the report that closed it — the same three numbers and
 * the same picture of the volume — and then lays out every exercise as it
 * was done, each one judged against the session before it. The warm-up
 * folds to a line, as it does everywhere else: it is the part that is the
 * same every time.
 */
export function SessionPage() {
  const { id = '' } = useParams()
  const detail = useSessionDetail(asWorkoutId(id))
  const exercises = useExercises()
  const { settings } = useSettings()

  if (detail.data === undefined) {
    return <PageHeader title="Session" subtitle="Loading…" />
  }
  if (detail.data === null) {
    return (
      <>
        <PageHeader title="Session" />
        <Card>
          <p className="text-ink-300 text-sm">This session is not in your history any more.</p>
        </Card>
      </>
    )
  }

  const { workout, sets, tonnage, minutes, entries, records } = detail.data
  const when = new Date(`${workout.date}T00:00:00`)
  const library = exercises.data ?? []
  const warmups = entries.filter(({ entry }) => entry.sets.every((set) => set.isWarmup))
  const working = entries.filter(({ entry }) => !entry.sets.every((set) => set.isWarmup))
  const up = working.filter(
    ({ versus }) => versus?.kind === 'heavier' || versus?.kind === 'more-reps',
  )

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <PageHeader
        title={splitDayLabel(workout.title).name}
        morph={morphName('session', workout.id)}
        action={
          <ShareSession
            card={shareCardFrom({
              title: workout.title,
              date: workout.date,
              sets,
              tonnage,
              minutes,
              units: settings.units,
              records: records.map((record) => ({
                ...record,
                name: nameOf(library, record.exerciseId),
              })),
            })}
          />
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {when.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
            {workout.status === 'abandoned' && <Badge tone="warn">Abandoned</Badge>}
          </span>
        }
      />

      <section className="hero-panel p-5 sm:p-6" aria-label="Session totals">
        <p className="text-ink-300 text-sm">
          {working.length === 0
            ? 'Nothing but the warm-up was logged.'
            : up.length === 0
              ? `${String(working.length)} exercises, none ahead of the session before.`
              : `${String(up.length)} of ${String(working.length)} exercises moved past the session before.`}
        </p>
        <SessionStats sets={sets} tonnage={tonnage} minutes={minutes} units={settings.units} />
      </section>

      <SessionNote key={workout.id} workoutId={workout.id} initial={workout.notes} />

      {warmups.length > 0 && <WarmupLine entries={warmups} library={library} />}

      {working.map((detailed, at) => (
        <ExerciseCard
          // A swap can split a slot into two entries sharing one order.
          key={`${detailed.entry.exerciseId}-${String(detailed.entry.order)}-${String(at)}`}
          detail={detailed}
          record={records.find((one) => one.exerciseId === detailed.entry.exerciseId)}
          library={library}
          units={settings.units}
        />
      ))}

      <SessionTimeline workout={workout} nameOf={(exerciseId) => nameOf(library, exerciseId)} />
    </div>
  )
}

function nameOf(library: readonly Exercise[], id: string): string {
  return library.find((exercise) => exercise.id === id)?.name ?? id
}

function WarmupLine({
  entries,
  library,
}: {
  readonly entries: readonly EntryDetail[]
  readonly library: readonly Exercise[]
}) {
  const [open, setOpen] = useState(false)
  const done = entries.filter(({ entry }) =>
    entry.sets.every((set) => set.outcome === 'completed'),
  ).length

  return (
    <Card className="py-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
        }}
        className="tap-target text-ink-500 hover:text-ink-300 flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[0.7rem] font-semibold tracking-[0.12em] uppercase">Warm-up</span>
        <span className="numeric flex items-center gap-1 text-xs">
          {done}/{entries.length} done
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        </span>
      </button>
      {open && (
        <ul className="divide-ink-800/70 divide-y pb-2">
          {entries.map(({ entry }) => (
            <li
              key={`${entry.exerciseId}-${String(entry.order)}`}
              className="text-ink-300 flex items-center justify-between py-1.5 text-sm"
            >
              {nameOf(library, entry.exerciseId)}
              <OutcomeMark set={entry.sets[0]} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * One exercise as it was done: the sets in order, and the top set against
 * the session before. A skipped or never-reached set stays in the list,
 * marked, because a session that stopped at set two is a different
 * session from one that was planned for two.
 */
function ExerciseCard({
  detail,
  record,
  library,
  units,
}: {
  readonly detail: EntryDetail
  readonly record?: SessionRecord | undefined
  readonly library: readonly Exercise[]
  readonly units: WeightUnit
}) {
  const { entry, previous, versus } = detail
  const exercise = library.find((one) => one.id === entry.exerciseId)
  const bodyweight = exercise?.loadBasis === 'bodyweight'
  const sets = entry.sets.filter((set) => !set.isWarmup)
  // The first set that matches the record is the one that set it.
  const recordIndex =
    record === undefined
      ? -1
      : sets.findIndex(
          (set) =>
            set.outcome === 'completed' &&
            set.actualLoad === record.set.load &&
            set.actualReps === record.set.reps,
        )

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-ink-50 truncate text-base font-semibold">
            <Link
              viewTransition
              to={`/exercise/${entry.exerciseId}`}
              className="hover:text-accent-400 transition-colors"
            >
              <MorphText
                to={`/exercise/${entry.exerciseId}`}
                name={morphName('exercise', entry.exerciseId)}
              >
                {exercise?.name ?? entry.exerciseId}
              </MorphText>
            </Link>
          </h2>
          {entry.variant !== undefined && (
            <p className="text-ink-500 mt-0.5 text-xs">{entry.variant}</p>
          )}
        </div>
        <span className="shrink-0 pt-0.5">
          {record !== undefined ? (
            <RecordChip kind={record.kind} />
          ) : versus === undefined ? (
            previous === undefined && sets.some((set) => set.outcome === 'completed') ? (
              <Badge tone="accent">First time</Badge>
            ) : null
          ) : (
            <VersusChip versus={versus} units={units} />
          )}
        </span>
      </div>

      <ol className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
        {sets.map((set, index) => (
          <li
            key={index}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-2.5 py-2',
              set.outcome === 'completed'
                ? 'border-ink-800 bg-ink-900/60'
                : 'border-ink-800/60 border-dashed opacity-60',
            )}
          >
            {index === recordIndex ? (
              <Star
                size={12}
                fill="currentColor"
                className="w-3 text-[oklch(0.86_0.13_85)]"
                aria-label="Record set"
              />
            ) : (
              <span className="text-ink-500 numeric w-3 text-xs">{index + 1}</span>
            )}
            <span className="numeric text-ink-50 truncate text-sm font-semibold">
              {describeSet(set, units, bodyweight)}
            </span>
          </li>
        ))}
      </ol>

      {sets.some((set) => set.notes !== undefined) && (
        <ul className="mt-3 space-y-1">
          {sets.map((set, index) =>
            set.notes === undefined ? null : (
              <li key={index} className="text-ink-300 text-xs">
                <span className="text-ink-500 numeric">Set {index + 1}</span> · “{set.notes}”
              </li>
            ),
          )}
        </ul>
      )}

      {previous !== undefined && (
        <p className="text-ink-500 numeric mt-3 text-xs">
          Session before: best set {describeLoad(previous.load, units, bodyweight)} ×{' '}
          {previous.reps ?? '—'}
        </p>
      )}
    </Card>
  )
}

function describeLoad(load: number | undefined, units: WeightUnit, bodyweight: boolean): string {
  if (bodyweight) return load === undefined || load <= 0 ? 'BW' : `BW + ${formatLoad(load, units)}`
  return load === undefined ? '—' : formatLoad(load, units)
}

function describeSet(set: LoggedSet, units: WeightUnit, bodyweight: boolean): string {
  if (set.outcome === 'skipped') return 'Skipped'
  if (set.outcome !== 'completed') return 'Not done'
  if (set.prescription.reps.kind === 'time') return describePrescription(set.prescription)
  return `${describeLoad(set.actualLoad, units, bodyweight)} × ${String(set.actualReps ?? '—')}`
}

function OutcomeMark({ set }: { readonly set: LoggedSet | undefined }) {
  if (set?.outcome === 'completed') {
    return <Check size={14} className="text-good-500" aria-label="Done" />
  }
  return <Minus size={14} className="text-ink-700" aria-label="Not done" />
}
