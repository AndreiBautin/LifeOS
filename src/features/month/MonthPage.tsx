import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { RECORD_LABELS } from '@/domain/logging/records'
import { monthRecap, monthsTrained, type MonthRecap } from '@/domain/logging/month'
import { toDayKey } from '@/domain/time/day'
import { describeHeft, heftOf } from '@/domain/units/heft'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardHeading } from '@/components/shared/primitives'
import { ShareSession } from '@/features/share/ShareSession'
import { useExercises, useRecentWorkouts } from '@/features/train/hooks'
import { cn } from '@/lib/cn'

const LIFT_NAMES = { squat: 'Squat', bench: 'Bench press', deadlift: 'Deadlift' } as const
const LIFT_COLOURS = {
  squat: 'var(--color-accent-400)',
  bench: 'var(--color-cool-500)',
  deadlift: 'var(--color-warn-500)',
} as const

/**
 * A month of training on one page (`monthRecap`): the totals against the
 * month before, the month as a calendar with each trained day lit by how
 * much was done, how far each competition lift's estimate moved, and the
 * records set. Stepped month to month, and shared as a picture with the
 * session card's renderer.
 *
 * **Its picture is the calendar**, laid out as the month actually falls,
 * Monday first — a month is read as weeks on a wall, which the training
 * grid's eighteen-week strip is too long and too thin to be.
 */
export function MonthPage() {
  const { month } = useParams()
  const { settings } = useSettings()
  const today = toDayKey(useServices().clock.now())
  const workouts = useRecentWorkouts(1000)
  const exercises = useExercises()

  if (workouts.data === undefined) return <PageHeader title="Month" subtitle="Loading…" />
  const months = monthsTrained(workouts.data)
  if (month === undefined) {
    const latest = months[0]
    return latest === undefined ? (
      <PageHeader title="Month" subtitle="Nothing finished yet." />
    ) : (
      <Navigate to={`/month/${latest}`} replace />
    )
  }

  const recap = monthRecap(workouts.data, month, today)
  const at = months.indexOf(month)
  const newer = at > 0 ? months[at - 1] : undefined
  const older = at === -1 ? months[0] : months[at + 1]
  const nameOf = (id: string) => exercises.data?.find((one) => one.id === id)?.name ?? id
  const title = monthName(month, today)

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <PageHeader
        title={title}
        subtitle={`${String(recap.sessions)} sessions · ${String(Object.keys(recap.days).length)} days trained`}
        action={
          <>
            <StepLink to={older} label="Earlier month" icon="back" />
            <StepLink to={newer} label="Later month" icon="forward" />
          </>
        }
      />

      <section className="hero-panel p-5 sm:p-6" aria-label="Month totals">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-accent-400 text-xs font-semibold tracking-[0.14em] uppercase">
            The month
          </p>
          {recap.sessions > 0 && (
            <ShareSession
              card={{
                eyebrow: 'Month in lifting',
                title,
                date: `${month}-01`,
                dateLine: `${String(recap.sessions)} sessions · ${String(Object.keys(recap.days).length)} days trained`,
                sets: recap.sets,
                volume: `${Math.round(recap.tonnage).toLocaleString()} ${settings.units}`,
                minutes: Math.round(recap.minutes / 60),
                timeLabel: 'Hours',
                ...heftLine(recap.tonnage, settings.units),
                /*
                 * The month's picture leads with what each lift's estimate
                 * did — four of thirty records picked by date said little —
                 * and falls back to records when no lift was measured.
                 */
                records:
                  recap.lifts.length > 0
                    ? recap.lifts.map(({ lift, from, to }) => ({
                        name: LIFT_NAMES[lift],
                        detail: `${to - from >= 0 ? '+' : ''}${String(to - from)} ${settings.units}`,
                        label: `Estimated max ${String(from)} → ${String(to)}`,
                      }))
                    : recap.records.slice(0, 4).map((record) => ({
                        name: nameOf(record.exerciseId),
                        detail: `${record.set.load === undefined ? 'BW' : formatLoad(record.set.load, settings.units)} × ${String(record.set.reps ?? '—')}`,
                        label: RECORD_LABELS[record.kind],
                      })),
                recordsHeading:
                  recap.lifts.length > 0
                    ? `${String(recap.records.length)} records · the lifts`
                    : undefined,
              }}
            />
          )}
        </div>
        <dl className="grid grid-cols-3 gap-3">
          <Total label="Sets" now={recap.sets} before={recap.previous.sets} />
          <Total
            label="Volume"
            now={Math.round(recap.tonnage)}
            before={Math.round(recap.previous.tonnage)}
            suffix={settings.units}
          />
          <Total
            label="Hours"
            now={Math.round(recap.minutes / 60)}
            before={Math.round(recap.previous.minutes / 60)}
          />
        </dl>
        {recap.previous.sessions > 0 && (
          <p className="text-ink-500 mt-2 text-xs">
            Against{' '}
            {recap.previousThrough.endsWith('-31')
              ? monthName(recap.previousThrough.slice(0, 7), today)
              : `${shortDay(`${recap.previousThrough.slice(0, 7)}-01`)}–${String(Number(recap.previousThrough.slice(8)))}`}
          </p>
        )}
        <MonthCalendar recap={recap} today={today} />
      </section>

      {recap.lifts.length > 0 && (
        <Card>
          <CardHeading title="Estimated max, start to end of month" />
          <ul className="space-y-2.5">
            {recap.lifts.map(({ lift, from, to }) => (
              <li key={lift} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-100 flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: LIFT_COLOURS[lift] }}
                    aria-hidden
                  />
                  {LIFT_NAMES[lift]}
                </span>
                <span className="numeric text-ink-300">
                  {from} → <span className="text-ink-50 font-semibold">{to}</span>{' '}
                  <Change by={to - from} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {recap.records.length > 0 && (
        <Card>
          <CardHeading
            icon={<Star size={16} aria-hidden />}
            title={`${String(recap.records.length)} ${recap.records.length === 1 ? 'record' : 'records'}`}
          />
          <ul className="space-y-2">
            {recap.records.map((record) => (
              <li
                key={`${record.exerciseId}-${record.date}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="text-ink-100 block truncate">{nameOf(record.exerciseId)}</span>
                  <span className="text-ink-500 text-xs">
                    {shortDay(record.date)} · {RECORD_LABELS[record.kind]}
                  </span>
                </span>
                <span className="numeric shrink-0 font-semibold text-[oklch(0.86_0.13_85)]">
                  {record.set.load === undefined
                    ? 'BW'
                    : formatLoad(record.set.load, settings.units)}{' '}
                  × {record.set.reps ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function StepLink({
  to,
  label,
  icon,
}: {
  readonly to: string | undefined
  readonly label: string
  readonly icon: 'back' | 'forward'
}) {
  const Icon = icon === 'back' ? ChevronLeft : ChevronRight
  return to === undefined ? (
    <span className="text-ink-700 tap-target flex items-center justify-center" aria-hidden>
      <Icon size={18} />
    </span>
  ) : (
    <Link
      viewTransition
      to={`/month/${to}`}
      aria-label={label}
      className="text-ink-300 hover:text-ink-50 tap-target flex items-center justify-center"
    >
      <Icon size={18} aria-hidden />
    </Link>
  )
}

function Total({
  label,
  now,
  before,
  suffix,
}: {
  readonly label: string
  readonly now: number
  readonly before: number
  readonly suffix?: string
}) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-500 text-[0.7rem] font-medium tracking-wide uppercase">{label}</dt>
      <dd className="numeric text-ink-50 mt-1 truncate text-lg font-semibold">
        {now.toLocaleString()}
        {suffix !== undefined && (
          <span className="text-ink-500 text-xs font-normal"> {suffix}</span>
        )}
      </dd>
      {before > 0 && (
        <dd className="text-ink-500 numeric text-xs">
          <Change by={now - before} percentOf={before} />
        </dd>
      )}
    </div>
  )
}

/** Quiet either way: a lighter month is often the plan (a deload). */
function Change({ by, percentOf }: { readonly by: number; readonly percentOf?: number }) {
  if (by === 0) return <span className="text-ink-500">±0</span>
  const Icon = by > 0 ? ArrowUp : ArrowDown
  const text =
    percentOf === undefined
      ? `${by > 0 ? '+' : ''}${String(by)}`
      : `${by > 0 ? '+' : ''}${String(Math.round((by / percentOf) * 100))}%`
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', by > 0 ? 'text-good-500' : 'text-ink-500')}
    >
      <Icon size={11} aria-hidden />
      {text}
    </span>
  )
}

/** The month as it falls on a wall calendar, Monday first; a trained day lit by its sets. */
function MonthCalendar({ recap, today }: { readonly recap: MonthRecap; readonly today: string }) {
  const [year = 2000, number = 1] = recap.month.split('-').map(Number)
  const first = new Date(year, number - 1, 1)
  const length = new Date(year, number, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const most = Math.max(1, ...Object.values(recap.days))

  return (
    <div className="mt-5">
      <div className="text-ink-500 mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[0.65rem]">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter, index) => (
          <span key={index} aria-hidden>
            {letter}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="Days trained">
        {Array.from({ length: lead }, (_, index) => (
          <li key={`lead-${String(index)}`} aria-hidden />
        ))}
        {Array.from({ length }, (_, index) => {
          const day = `${recap.month}-${String(index + 1).padStart(2, '0')}`
          const sets = recap.days[day] ?? 0
          return (
            <li
              key={day}
              aria-label={sets === 0 ? undefined : `${shortDay(day)}: ${String(sets)} sets`}
              className={cn(
                'numeric flex aspect-square items-center justify-center rounded-lg text-xs',
                sets === 0 ? 'text-ink-500 bg-ink-900/50' : 'text-ink-950 font-semibold',
                day === today && 'ring-accent-400 ring-2',
                day > today && 'opacity-40',
              )}
              style={
                sets === 0
                  ? undefined
                  : {
                      background: `color-mix(in oklab, var(--color-accent-400) ${String(
                        Math.round(45 + (sets / most) * 55),
                      )}%, transparent)`,
                    }
              }
            >
              {index + 1}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function heftLine(tonnage: number, units: WeightUnit): { readonly heft?: string } {
  const heft = heftOf(tonnage, units)
  return heft === undefined ? {} : { heft: `about ${describeHeft(heft)}` }
}

function monthName(month: string, today: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    ...(month.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
  })
}

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
