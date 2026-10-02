import type { ExerciseId } from '@/domain/ids/ids'
import { sessionRecords } from '@/domain/logging/records'
import { isProgress, previousTopSet, topSetIn, versusLast } from '@/domain/logging/versus-last'
import { totalTonnage, totalWorkingSets, type WorkoutLog } from '@/domain/logging/workout-log'
import { mondayOf, shiftDay } from '@/domain/time/day'

/**
 * Last week, against the week before it.
 *
 * Calendar weeks from Monday, the rule the week card already follows, and
 * finished sessions only. **What moved is counted per exercise, not per
 * set**: an exercise progressed if its top set beat the session before
 * it, by the same rule the set rows and the report use, so the recap
 * cannot tell a different story from the screens that were there.
 */
export interface WeekTotals {
  readonly monday: string
  readonly sessions: number
  readonly sets: number
  readonly tonnage: number
  /** Volume per day, Monday first. */
  readonly byDay: readonly number[]
}

export interface WeekRecap {
  readonly last: WeekTotals
  readonly before: WeekTotals
  /** Exercises whose top set last week beat the session before it. */
  readonly progressed: number
  /** Personal records set last week. */
  readonly records: number
}

export function weekRecap(logs: readonly WorkoutLog[], today: string): WeekRecap | undefined {
  const thisMonday = mondayOf(today)
  const lastMonday = shiftDay(thisMonday, -7)
  const beforeMonday = shiftDay(thisMonday, -14)
  const finished = logs.filter((log) => log.status === 'completed')

  const inWeek = (monday: string) =>
    finished.filter((log) => log.date >= monday && log.date < shiftDay(monday, 7))

  const last = inWeek(lastMonday)
  if (last.length === 0) return undefined

  const progressed = new Set<ExerciseId>()
  for (const log of last) {
    for (const entry of log.entries) {
      const top = topSetIn(log, entry.exerciseId, entry.variant)
      const before = previousTopSet(finished, log, entry.exerciseId, entry.variant)
      const versus = top === undefined || before === undefined ? undefined : versusLast(top, before)
      if (versus !== undefined && isProgress(versus)) progressed.add(entry.exerciseId)
    }
  }

  const records = sessionRecords(finished)
  return {
    last: totals(lastMonday, last),
    before: totals(beforeMonday, inWeek(beforeMonday)),
    progressed: progressed.size,
    records: last.reduce((sum, log) => sum + (records.get(log.id)?.length ?? 0), 0),
  }
}

function totals(monday: string, logs: readonly WorkoutLog[]): WeekTotals {
  const byDay = Array.from({ length: 7 }, (_, day) =>
    logs
      .filter((log) => log.date === shiftDay(monday, day))
      .reduce((sum, log) => sum + totalTonnage(log), 0),
  )
  return {
    monday,
    sessions: logs.length,
    sets: logs.reduce((sum, log) => sum + totalWorkingSets(log), 0),
    tonnage: byDay.reduce((sum, value) => sum + value, 0),
    byDay,
  }
}
