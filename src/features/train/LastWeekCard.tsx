import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarRange, Star } from 'lucide-react'

import { useServices, useSettings } from '@/app/context'
import { weekRecap } from '@/domain/logging/recap'
import { toDayKey } from '@/domain/time/day'
import { Card, CardHeading } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

/**
 * Last week, against the week before it.
 *
 * **Its shape is the week as days.** Seven columns, Monday first: last
 * week's volume filled, the week before as a ghost outline behind each
 * day, so a heavier Thursday or a missed Saturday reads at a glance
 * without a single number. The numbers come underneath, each with its
 * change, and one line on what moved — exercises that beat the session
 * before them, and records set.
 *
 * Silent when last week had no finished session: a recap of nothing is
 * a card saying so, every Monday, for anybody coming back from a break.
 */
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

export function LastWeekCard() {
  const services = useServices()
  const { settings } = useSettings()
  const today = toDayKey(services.clock.now())

  const recap = useQuery({
    queryKey: ['workouts', 'recap', today],
    queryFn: async () => weekRecap(await services.workouts.recent(500), today) ?? null,
  })

  const data = recap.data
  if (data === undefined || data === null) return null
  const { last, before, progressed, records } = data
  const peak = Math.max(1, ...last.byDay, ...before.byDay)

  return (
    <Card>
      <CardHeading
        icon={<CalendarRange size={16} aria-hidden />}
        title="Last week"
        action={
          <Link viewTransition to="/month" className="text-accent-400 text-xs hover:underline">
            The month →
          </Link>
        }
      />

      <div
        className="flex h-24 items-end gap-2"
        role="img"
        aria-label={`Volume by day last week: ${last.byDay
          .map((value, day) => `${DAYS[day] ?? ''} ${String(Math.round(value))}`)
          .join(', ')}`}
      >
        {last.byDay.map((value, day) => {
          const ghost = before.byDay[day] ?? 0
          return (
            <div key={day} className="flex h-full flex-1 flex-col items-center gap-1">
              <div className="relative flex w-full flex-1 items-end justify-center">
                {ghost > 0 && (
                  <div
                    className="border-ink-700 absolute bottom-0 w-full rounded-t-md border border-dashed"
                    style={{ height: `${String((ghost / peak) * 100)}%` }}
                  />
                )}
                {value > 0 && (
                  <div
                    className="bar-rise relative w-3/5 rounded-t-md"
                    style={{
                      height: `${String((value / peak) * 100)}%`,
                      background:
                        'linear-gradient(180deg, var(--color-accent-400), color-mix(in oklab, var(--color-accent-500) 45%, transparent))',
                      ['--bar-delay' as string]: `${String(day * 60)}ms`,
                    }}
                  />
                )}
              </div>
              <span
                className={cn(
                  'text-[0.65rem] font-semibold',
                  value > 0 ? 'text-ink-300' : 'text-ink-700',
                )}
              >
                {DAYS[day]}
              </span>
            </div>
          )
        })}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Figure label="Sessions" now={last.sessions} then={before.sessions} />
        <Figure label="Sets" now={last.sets} then={before.sets} />
        <Figure
          label="Volume"
          now={Math.round(last.tonnage)}
          then={Math.round(before.tonnage)}
          suffix={` ${settings.units}`}
          percent
        />
      </dl>

      {(progressed > 0 || records > 0) && (
        <p className="text-ink-300 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {progressed > 0 && (
            <span>
              <span className="text-accent-400 numeric font-semibold">{progressed}</span>{' '}
              {progressed === 1 ? 'exercise' : 'exercises'} moved up
            </span>
          )}
          {records > 0 && (
            <span className="inline-flex items-center gap-1 text-[oklch(0.86_0.13_85)]">
              <Star size={11} fill="currentColor" aria-hidden />
              <span className="numeric font-semibold">{records}</span>
              {records === 1 ? 'record' : 'records'}
            </span>
          )}
        </p>
      )}
      <p className="text-ink-500 mt-2 text-[0.7rem]">Dashed outlines are the week before.</p>
    </Card>
  )
}

/**
 * A figure and its change on the week before. The change is in quiet ink
 * either way — a lighter week is often the plan, not a lapse — and says
 * nothing when the week before had nothing to compare with.
 */
function Figure({
  label,
  now,
  then,
  suffix = '',
  percent = false,
}: {
  readonly label: string
  readonly now: number
  readonly then: number
  readonly suffix?: string
  readonly percent?: boolean
}) {
  const delta = now - then
  const change =
    then === 0 || delta === 0
      ? undefined
      : percent
        ? `${delta > 0 ? '+' : '−'}${String(Math.round((Math.abs(delta) / then) * 100))}%`
        : `${delta > 0 ? '+' : '−'}${String(Math.abs(delta))}`

  return (
    <div className="min-w-0">
      <dt className="text-ink-500 text-[0.7rem] font-medium tracking-wide uppercase">{label}</dt>
      <dd className="numeric text-ink-50 mt-0.5 truncate text-base font-semibold">
        {now.toLocaleString()}
        {suffix !== '' && <span className="text-ink-500 text-xs font-normal">{suffix}</span>}
      </dd>
      {change !== undefined && <p className="text-ink-500 numeric text-xs">{change}</p>}
    </div>
  )
}
