import { CalendarDays } from 'lucide-react'

import { Link } from 'react-router-dom'
import { Card, CardHeading } from '@/components/shared/primitives'
import { Skeleton } from '@/components/shared/Skeleton'
import type { ActivityDay } from '@/application/use-cases/training/activity'
import { parseDay } from '@/domain/time/day'
import { cn } from '@/lib/cn'

import { useActivity } from './hooks'

/**
 * Every day of the last four months, lit by the working sets done on it.
 *
 * **The bands are fixed set counts, never a share of the busiest day.**
 * Normalising to the tallest cell is the default every heatmap library
 * ships and it lies the way `BarSeries`' note describes: a quiet month
 * would look exactly as vivid as a full one. Ten sets is a short session,
 * twenty a full one and thirty a long one.
 */
const BANDS = [1, 10, 20, 30] as const

function bandOf(sets: number): number {
  return BANDS.filter((threshold) => sets >= threshold).length
}

const BAND_FILL = [
  'var(--surface-inset)',
  'color-mix(in oklab, var(--color-accent-500) 28%, var(--surface-inset))',
  'color-mix(in oklab, var(--color-accent-500) 50%, var(--surface-inset))',
  'color-mix(in oklab, var(--color-accent-500) 75%, var(--surface-inset))',
  'var(--color-accent-400)',
] as const

const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''] as const

function describe(day: ActivityDay): string {
  const date = parseDay(day.day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return day.sets > 0
    ? `${date} · ${String(day.sets)} working ${day.sets === 1 ? 'set' : 'sets'}`
    : `${date} · nothing logged`
}

function monthOf(day: string): string {
  return parseDay(day).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
}

export function ActivityHeatmap() {
  const activity = useActivity()

  if (activity.data === undefined) {
    return (
      <Card>
        <Skeleton className="h-36 w-full" />
      </Card>
    )
  }

  const { weeks, sessions, sets } = activity.data
  const columns = `1.75rem repeat(${String(weeks.length)}, minmax(0, 1fr))`
  const summary = `${String(sessions)} sessions and ${sets.toLocaleString()} working sets in the last ${String(weeks.length)} weeks`

  return (
    <Card>
      <CardHeading icon={<CalendarDays size={14} aria-hidden />} title="Training" />

      <p className="text-ink-300 numeric mb-3 text-sm">
        <span className="text-ink-50 font-semibold">{sessions}</span> sessions ·{' '}
        <span className="text-ink-50 font-semibold">{sets.toLocaleString()}</span> working sets in{' '}
        {weeks.length} weeks
      </p>

      {/*
        **One grid for the labels and the cells.** The weekday names sat in
        a column of their own and drifted twenty pixels off their rows by
        Friday, because a line of text is taller than a thirteen-pixel cell.
        Sharing the grid's rows is what keeps them level at any width.
      */}
      {/*
        **A trained day opens its session.** The grid was a picture of the
        work and nothing more; every lit cell is now a link to what was
        done that day (the larger session, on a day with two). Hover lifts
        it, so the grid reads as something to explore.
      */}
      <p className="sr-only">{summary}</p>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: columns }}>
        <span aria-hidden />
        {/* A month's name over the week it begins in. */}
        {weeks.map((week, index) => {
          const first = week[0]?.day ?? ''
          const previous = weeks[index - 1]?.[0]?.day ?? ''
          const starts = index === 0 || monthOf(first) !== monthOf(previous)
          return (
            <span
              key={first}
              aria-hidden
              className="text-ink-600 h-3 overflow-visible text-[9px] leading-none whitespace-nowrap"
            >
              {starts ? monthOf(first) : ''}
            </span>
          )
        })}

        <div
          aria-hidden
          className="text-ink-600 grid grid-rows-7 gap-[3px] text-[9px] leading-none"
        >
          {WEEKDAY_LABELS.map((label, index) => (
            <span key={index} className="flex items-center">
              {label}
            </span>
          ))}
        </div>

        {weeks.map((week, column) => (
          <div key={week[0]?.day ?? column} className="grid grid-rows-7 gap-[3px]">
            {week.map((day) => {
              const style = {
                backgroundColor: BAND_FILL[bandOf(day.sets)],
                '--cell-delay': `${String(column * 22)}ms`,
              } as React.CSSProperties
              return day.workoutId === undefined ? (
                <span
                  key={day.day}
                  aria-hidden
                  title={day.future ? undefined : describe(day)}
                  className={cn('heat-cell aspect-square rounded-[3px]', day.future && 'opacity-0')}
                  style={style}
                />
              ) : (
                <Link
                  key={day.day}
                  viewTransition
                  to={`/session/${day.workoutId}`}
                  title={describe(day)}
                  aria-label={describe(day)}
                  className="heat-cell hover:ring-accent-400 focus-visible:ring-accent-400 aspect-square rounded-[3px] transition-transform hover:z-10 hover:scale-125 hover:ring-1"
                  style={style}
                />
              )
            })}
          </div>
        ))}
      </div>

      <div className="text-ink-600 mt-2 flex items-center justify-end gap-1 text-[10px]">
        Less
        {BAND_FILL.map((fill) => (
          <span key={fill} className="size-2.5 rounded-[3px]" style={{ backgroundColor: fill }} />
        ))}
        More
      </div>
    </Card>
  )
}
