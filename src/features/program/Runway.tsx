import { CalendarRange, Check } from 'lucide-react'

import type { ProgramTemplate } from '@/domain/programs/program'
import { weeksAhead } from '@/domain/programs/schedule'
import { Card, CardHeading } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

import { splitDayLabel } from '@/features/train/useNextSession'

const WEEKS = 4
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/**
 * The next four weeks as the calendar will hold them: a row a week, a
 * cell a day, so where the deload lands and what each day is read at a
 * glance — the question the week picker above can only answer one week
 * at a time.
 *
 * **Read from `weeksAhead`, which asks `sessionOn`** — the same question
 * the hero asks — so this cannot promise a Tuesday the app will not
 * offer. This week's finished days are ticked, the days before today that
 * were not are dimmed, and today is ringed. The deload row is tinted
 * cool and says so, with a count of the weeks until it.
 */
export function Runway({
  program,
  blockStartedOn,
  today,
  done,
}: {
  readonly program: ProgramTemplate
  readonly blockStartedOn: string
  readonly today: string
  /** Labels of the sessions finished this calendar week. */
  readonly done: ReadonlySet<string>
}) {
  const weeks = weeksAhead(program, blockStartedOn, today, WEEKS)
  const deloadIn = weeks.findIndex((week) => week.isDeload)

  return (
    <Card className="mt-4">
      <CardHeading icon={<CalendarRange size={16} aria-hidden />} title="Next four weeks" />
      <p className="text-ink-500 mb-3 text-xs">
        {deloadIn === -1
          ? 'No deload in the next four weeks.'
          : deloadIn === 0
            ? 'This is the deload week.'
            : `Deload in ${String(deloadIn)} ${deloadIn === 1 ? 'week' : 'weeks'}.`}
      </p>

      <div
        className="grid items-center gap-x-1 gap-y-1.5"
        style={{ gridTemplateColumns: '4.5rem repeat(7, minmax(0, 1fr))' }}
      >
        <span aria-hidden />
        {WEEKDAYS.map((letter, at) => (
          <span key={at} className="text-ink-500 text-center text-[0.65rem]" aria-hidden>
            {letter}
          </span>
        ))}

        {weeks.map((week, row) => (
          <Row key={week.monday} week={week} row={row} today={today} done={done} />
        ))}
      </div>
    </Card>
  )
}

function Row({
  week,
  row,
  today,
  done,
}: {
  readonly week: ReturnType<typeof weeksAhead>[number]
  readonly row: number
  readonly today: string
  readonly done: ReadonlySet<string>
}) {
  return (
    <>
      <span className="min-w-0">
        <span className="text-ink-100 block truncate text-xs font-medium">
          {row === 0 ? 'This week' : shortDay(week.monday)}
        </span>
        <span
          className={cn(
            'block text-[0.65rem]',
            week.isDeload ? 'text-cool-500 font-semibold' : 'text-ink-500',
          )}
        >
          {week.isDeload ? 'Deload' : `Week ${String(week.slot.weekIndex + 1)}`}
        </span>
      </span>
      {week.days.map((day) => {
        const session = day.session
        const isToday = day.on === today
        const past = day.on < today
        const finished = session !== undefined && row === 0 && done.has(session.label)
        const name = session === undefined ? undefined : splitDayLabel(session.label).name
        return (
          <span
            key={day.on}
            title={name === undefined ? 'Rest' : `${shortDay(day.on)} · ${name}`}
            className={cn(
              'numeric relative flex h-9 items-center justify-center rounded-lg border text-[0.7rem] font-semibold',
              session === undefined
                ? 'border-transparent'
                : finished
                  ? 'border-good-500/40 bg-good-500/15 text-good-500'
                  : week.isDeload
                    ? 'border-cool-500/30 bg-cool-500/10 text-cool-500'
                    : 'border-ink-800 bg-ink-900/70 text-ink-100',
              past && !finished && session !== undefined && 'opacity-40',
              isToday && 'ring-accent-400 ring-2 ring-offset-1 ring-offset-transparent',
            )}
          >
            {session === undefined ? (
              <span className="bg-ink-800 size-1 rounded-full" aria-hidden />
            ) : finished ? (
              <Check size={14} aria-label={`${name ?? ''} done`} />
            ) : (
              <span aria-label={name}>{initials(name ?? '')}</span>
            )}
          </span>
        )
      })}
    </>
  )
}

/**
 * What a cell can hold: "Legs A" → "LA", "Push" stays "Push", "Upper" →
 * "Up". Two letters for everything read Push and Pull both as "Pu".
 */
function initials(name: string): string {
  const words = name.split(/\s+/).filter((word) => word !== '')
  if (words.length > 1)
    return words
      .map((word) => word[0] ?? '')
      .join('')
      .slice(0, 2)
  return name.length <= 4 ? name : name.slice(0, 2)
}

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
