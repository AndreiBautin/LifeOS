import { CalendarDays, Flame } from 'lucide-react'

import { Card, CardHeading } from '@/components/shared/primitives'
import { Skeleton } from '@/components/shared/Skeleton'
import type { ActivityDay } from '@/application/use-cases/character/activity'
import { parseDay } from '@/domain/time/day'
import { cn } from '@/lib/cn'

import { useActivity } from './hooks'

/**
 * Every day of the last four months, lit by the XP it earned.
 *
 * **The bands are fixed amounts of XP, never a share of the busiest
 * day.** Normalising to the tallest cell is the default every heatmap
 * library ships and it lies the way `BarSeries`' note describes: a quiet
 * month would look exactly as vivid as a full one. Fifty points is about
 * one kept goal or one set of steps; two hundred is a real session. Those
 * are this app's own prices, stated once, here.
 *
 * It answers "is this used" at a glance, which is the question a first
 * look at the app is really asking.
 */
const BANDS = [1, 50, 100, 200] as const

function bandOf(xp: number): number {
  return BANDS.filter((threshold) => xp >= threshold).length
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
  return day.xp > 0 ? `${date} · ${day.xp.toLocaleString()} XP` : `${date} · nothing logged`
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

  const { weeks, activeDays, totalXp, streak } = activity.data
  const columns = `1.75rem repeat(${String(weeks.length)}, minmax(0, 1fr))`
  const summary = `${String(activeDays)} active days and ${totalXp.toLocaleString()} XP in the last ${String(weeks.length)} weeks`

  return (
    <Card>
      <CardHeading
        icon={<CalendarDays size={14} aria-hidden />}
        title="Activity"
        action={
          streak > 1 ? (
            <span className="text-warn-500 flex items-center gap-1 text-xs font-medium">
              <Flame size={14} aria-hidden />
              {streak}-day streak
            </span>
          ) : undefined
        }
      />

      <p className="text-ink-300 numeric mb-3 text-sm">
        <span className="text-ink-50 font-semibold">{activeDays}</span> active days ·{' '}
        <span className="text-ink-50 font-semibold">{totalXp.toLocaleString()}</span> XP in{' '}
        {weeks.length} weeks
      </p>

      {/*
        **One grid for the labels and the cells.** The weekday names sat in
        a column of their own and drifted twenty pixels off their rows by
        Friday, because a line of text is taller than a thirteen-pixel cell.
        Sharing the grid's rows is what keeps them level at any width.
      */}
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: columns }}
        role="img"
        aria-label={summary}
      >
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
          <div key={week[0]?.day ?? column} aria-hidden className="grid grid-rows-7 gap-[3px]">
            {week.map((day) => (
              <span
                key={day.day}
                title={day.future ? undefined : describe(day)}
                className={cn('heat-cell aspect-square rounded-[3px]', day.future && 'opacity-0')}
                style={
                  {
                    backgroundColor: BAND_FILL[bandOf(day.xp)],
                    '--cell-delay': `${String(column * 22)}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
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
