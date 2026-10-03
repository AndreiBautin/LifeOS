import type { ExerciseId } from '@/domain/ids/ids'
import { strengthTrend, type TrendLift } from '@/domain/strength/trend'

import { sessionRecords, type RecordKind } from './records'
import type { Performance } from './versus-last'
import { totalTonnage, totalWorkingSets, type WorkoutLog } from './workout-log'

/**
 * A calendar month of training: the totals, the days trained, the records
 * set and how far each competition lift's estimate moved — against the
 * month before for the totals.
 *
 * Finished sessions only, by the same rules the week recap and the report
 * use (`totalWorkingSets`, `totalTonnage`, `sessionRecords`,
 * `strengthTrend`), so the month cannot tell a different story from the
 * screens that were there for each session.
 */
export interface MonthTotals {
  readonly sessions: number
  readonly sets: number
  readonly tonnage: number
  /** Logged time; sessions with no recorded length add nothing. */
  readonly minutes: number
}

export interface MonthRecap extends MonthTotals {
  /** `YYYY-MM`. */
  readonly month: string
  /** Working sets per trained day key. */
  readonly days: Readonly<Record<string, number>>
  readonly records: readonly {
    readonly exerciseId: ExerciseId
    readonly kind: RecordKind
    readonly set: Performance
    readonly date: string
  }[]
  /** Each competition lift's estimate, first and last reading this month. */
  readonly lifts: readonly {
    readonly lift: TrendLift
    readonly from: number
    readonly to: number
  }[]
  readonly previous: MonthTotals
  /**
   * The last day of the month before that `previous` counts: its end for
   * a finished month, the same day number for the month still running.
   */
  readonly previousThrough: string
}

export function monthRecap(logs: readonly WorkoutLog[], month: string, today: string): MonthRecap {
  const finished = logs.filter((log) => log.status === 'completed')
  const inMonth = finished.filter((log) => log.date.startsWith(month))
  /*
   * **A month still running is compared like for like**: the first two
   * days of October against the first two of September, not against all
   * of it — which read as a 93% fall on the second of the month.
   */
  const last = previousMonth(month)
  const previousThrough = today.startsWith(month) ? `${last}-${today.slice(8, 10)}` : `${last}-31`
  const before = finished.filter((log) => log.date.startsWith(last) && log.date <= previousThrough)

  const days: Record<string, number> = {}
  for (const log of inMonth) days[log.date] = (days[log.date] ?? 0) + totalWorkingSets(log)

  const recordsBy = sessionRecords(finished)
  const records = inMonth
    .toSorted((a, b) => a.date.localeCompare(b.date))
    .flatMap((log) =>
      (recordsBy.get(log.id) ?? []).map((record) => ({ ...record, date: log.date })),
    )

  const trend = strengthTrend(finished)
  const lifts = (Object.keys(trend) as TrendLift[]).flatMap((lift) => {
    const points = trend[lift].filter((point) => point.date.startsWith(month))
    const first = points[0]
    const last = points.at(-1)
    return first === undefined || last === undefined
      ? []
      : [{ lift, from: first.value, to: last.value }]
  })

  return {
    month,
    ...totals(inMonth),
    days,
    records,
    lifts,
    previous: totals(before),
    previousThrough,
  }
}

/** The months with a finished session, newest first. */
export function monthsTrained(logs: readonly WorkoutLog[]): readonly string[] {
  return [
    ...new Set(logs.filter((log) => log.status === 'completed').map((log) => log.date.slice(0, 7))),
  ].toSorted((a, b) => b.localeCompare(a))
}

export function previousMonth(month: string): string {
  const [year = 0, number = 1] = month.split('-').map(Number)
  return number === 1
    ? `${String(year - 1)}-12`
    : `${String(year)}-${String(number - 1).padStart(2, '0')}`
}

function totals(logs: readonly WorkoutLog[]): MonthTotals {
  return {
    sessions: logs.length,
    sets: logs.reduce((sum, log) => sum + totalWorkingSets(log), 0),
    tonnage: logs.reduce((sum, log) => sum + totalTonnage(log), 0),
    minutes: logs.reduce((sum, log) => sum + minutesOf(log), 0),
  }
}

function minutesOf(log: WorkoutLog): number {
  if (log.completedAt === undefined) return 0
  const elapsed = Math.round((Date.parse(log.completedAt) - Date.parse(log.startedAt)) / 60_000)
  return elapsed > 0 ? elapsed : 0
}
