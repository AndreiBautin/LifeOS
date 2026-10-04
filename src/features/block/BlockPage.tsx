import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { blockReport, blockWindow, type BlockLift } from '@/domain/logging/block'
import { shiftDay, toDayKey } from '@/domain/time/day'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardHeading } from '@/components/shared/primitives'
import { useExercises, useProgram, useRecentWorkouts, useSchedule } from '@/features/train/hooks'
import { cn } from '@/lib/cn'

/** Lines drawn in the fan; the rest are listed beneath it. */
const FAN_LINES = 8

/**
 * One run through the program, start to finish (`blockReport`): the
 * totals, the sets in each week with the deload where it falls, and how
 * far every loaded exercise's top set moved.
 *
 * **Its picture is a fan**: every line leaves one point on the left — where
 * each exercise started the block — and ends at its change, on one
 * percentage scale. Loads of 45 and 405 cannot share an axis; changes
 * can, and a fan shows at a glance whether the block moved everything a
 * little, a few things a lot, or nothing. Stepped block to block with
 * `?ago=`.
 */
export function BlockPage() {
  const [params] = useSearchParams()
  const ago = Math.max(0, Number(params.get('ago') ?? 0) || 0)
  const { settings } = useSettings()
  const today = toDayKey(useServices().clock.now())
  const program = useProgram()
  const schedule = useSchedule()
  const workouts = useRecentWorkouts(1000)
  const exercises = useExercises()

  if (program.data === undefined || schedule.data === undefined || workouts.data === undefined) {
    return <PageHeader title="Block" subtitle="Loading…" />
  }

  const weeks = program.data.blocks.flatMap((block) => block.weeks)
  const window = blockWindow(schedule.data.blockStartedOn, weeks.length, today, ago)
  const report = blockReport(workouts.data, window, today)
  const running = ago === 0
  const nameOf = (id: string) => exercises.data?.find((one) => one.id === id)?.name ?? id

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <PageHeader
        title={running ? 'This block' : ago === 1 ? 'Last block' : `${String(ago)} blocks ago`}
        subtitle={`${range(window.start, window.end, today)}${running ? ' · running' : ''}`}
        action={
          <>
            <Step to={`/block?ago=${String(ago + 1)}`} label="Earlier block" back />
            <Step
              to={ago === 0 ? undefined : `/block?ago=${String(ago - 1)}`}
              label="Later block"
            />
          </>
        }
      />

      <section className="hero-panel p-5 sm:p-6" aria-label="Block totals">
        <dl className="grid grid-cols-4 gap-3">
          <Figure label="Sessions" value={String(report.sessions)} />
          <Figure label="Sets" value={String(report.sets)} />
          <Figure label="Volume" value={`${(report.tonnage / 1000).toFixed(1)}k`} />
          <Figure label="Records" value={String(report.records)} />
        </dl>
        <ol className="mt-5 flex gap-1.5" aria-label="Sets by week">
          {report.perWeek.map((sets, week) => {
            const most = Math.max(1, ...report.perWeek)
            const deload = weeks[week]?.isDeload === true
            const future = shiftDay(window.start, week * 7) > report.through
            return (
              <li key={week} className="flex flex-1 flex-col items-center gap-1">
                <span className="flex h-14 w-full items-end">
                  <span
                    className={cn(
                      'w-full rounded-md transition-[height] duration-500',
                      future
                        ? 'border-ink-700 h-full border border-dashed'
                        : deload
                          ? 'bg-cool-500/60'
                          : 'bg-accent-500/80',
                    )}
                    style={
                      future
                        ? undefined
                        : { height: `${String(Math.max(6, (sets / most) * 100))}%` }
                    }
                  />
                </span>
                <span className="numeric text-ink-500 text-[0.65rem]">
                  {deload ? 'DL' : `W${String(week + 1)}`}
                </span>
                <span className="sr-only">{future ? 'Not yet' : `${String(sets)} sets`}</span>
              </li>
            )
          })}
        </ol>
      </section>

      <Card>
        <CardHeading icon={<TrendingUp size={16} aria-hidden />} title="Top sets, start to end" />
        {report.lifts.length === 0 ? (
          <p className="text-ink-500 text-sm">
            An exercise appears once it has been loaded in two sessions this block.
          </p>
        ) : (
          <>
            <Fan lifts={report.lifts.slice(0, FAN_LINES)} nameOf={nameOf} />
            <ul className="divide-ink-800/60 mt-3 divide-y">
              {report.lifts.map((lift) => (
                <LiftRow
                  key={`${lift.exerciseId}|${lift.version ?? ''}`}
                  lift={lift}
                  name={lineName(lift, nameOf)}
                  units={settings.units}
                />
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}

function Fan({
  lifts,
  nameOf,
}: {
  readonly lifts: readonly BlockLift[]
  readonly nameOf: (id: string) => string
}) {
  const width = 320
  const height = 180
  const left = 16
  const right = 200
  const reach = Math.max(0.05, ...lifts.map((lift) => Math.abs(lift.change)))
  const mid = height / 2
  const y = (change: number) => mid - (change / reach) * (mid - 14)
  // Labels step apart when two changes would print on top of each other.
  const placed: number[] = []
  const labelY = (want: number) => {
    let at = want
    while (placed.some((one) => Math.abs(one - at) < 12)) at += 12
    placed.push(at)
    return at
  }
  return (
    <svg viewBox={`0 0 ${String(width)} ${String(height)}`} className="w-full" role="img">
      <title>Change in each exercise&apos;s top set over the block</title>
      <line
        x1={left}
        x2={right}
        y1={mid}
        y2={mid}
        className="stroke-ink-700"
        strokeDasharray="3 4"
      />
      <text x={left} y={mid + 14} textAnchor="middle" className="fill-ink-500 text-[8px]">
        Start
      </text>
      {lifts.map((lift, at) => {
        const end = y(lift.change)
        const up = lift.change > 0
        return (
          <g
            key={`${lift.exerciseId}|${lift.version ?? ''}`}
            className="fan-line"
            style={{ animationDelay: `${String(at * 70)}ms` }}
          >
            <path
              d={`M ${String(left)} ${String(mid)} C ${String(left + 90)} ${String(mid)}, ${String(right - 70)} ${String(end)}, ${String(right)} ${String(end)}`}
              className={cn(
                'fill-none',
                up ? 'stroke-accent-400' : lift.change < 0 ? 'stroke-warn-500' : 'stroke-ink-500',
              )}
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={1}
            />
            <circle cx={right} cy={end} r="3" className={up ? 'fill-accent-400' : 'fill-ink-500'} />
            <text x={right + 8} y={labelY(end + 3)} className="fill-ink-300 text-[8.5px]">
              {pct(lift.change)} {shortName(lineName(lift, nameOf))}
            </text>
          </g>
        )
      })}
      <circle cx={left} cy={mid} r="3.5" className="fill-ink-100" />
    </svg>
  )
}

function LiftRow({
  lift,
  name,
  units,
}: {
  readonly lift: BlockLift
  readonly name: string
  readonly units: WeightUnit
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Link
        viewTransition
        to={`/exercise/${lift.exerciseId}`}
        className="text-ink-100 hover:text-accent-400 min-w-0 flex-1 truncate text-sm"
      >
        {name}
      </Link>
      <span className="numeric text-ink-500 text-xs">
        {formatLoad(lift.from.load, units)} × {lift.from.reps} → {formatLoad(lift.to.load, units)} ×{' '}
        {lift.to.reps}
      </span>
      <span
        className={cn(
          'numeric w-12 text-right text-sm font-semibold',
          lift.change > 0 ? 'text-accent-400' : lift.change < 0 ? 'text-warn-500' : 'text-ink-500',
        )}
      >
        {pct(lift.change)}
      </span>
    </li>
  )
}

function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-ink-500 text-[0.65rem] tracking-wide uppercase">{label}</dt>
      <dd className="numeric text-ink-50 mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  )
}

function Step({
  to,
  label,
  back = false,
}: {
  readonly to: string | undefined
  readonly label: string
  readonly back?: boolean
}) {
  const Icon = back ? ChevronLeft : ChevronRight
  return to === undefined ? (
    <span className="text-ink-700 tap-target flex items-center px-2" aria-hidden>
      <Icon size={18} />
    </span>
  ) : (
    <Link
      viewTransition
      to={to}
      aria-label={label}
      className="text-ink-300 hover:text-accent-400 tap-target flex items-center px-2"
    >
      <Icon size={18} aria-hidden />
    </Link>
  )
}

function pct(change: number): string {
  const value = Math.round(change * 1000) / 10
  return `${value > 0 ? '+' : ''}${String(value)}%`
}

function shortName(name: string): string {
  return name.length > 16 ? `${name.slice(0, 15)}…` : name
}

function range(start: string, end: string, today: string): string {
  const show = (day: string) =>
    new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
    })
  return `${show(start)} – ${show(end)}`
}

function lineName(lift: BlockLift, nameOf: (id: string) => string): string {
  const name = nameOf(lift.exerciseId)
  return lift.version === undefined ? name : `${name} · ${lift.version}`
}
