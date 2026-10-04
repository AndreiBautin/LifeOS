import type { ExerciseId } from '@/domain/ids/ids'
import { mondayOf, parseDay, shiftDay } from '@/domain/time/day'

import { blockReport, type BlockLift } from './block'
import { totalWorkingSets, workingSets, type WorkoutLog } from './workout-log'

/** A stretch of time to tell the story of: a month (`YYYY-MM`) or a year (`YYYY`). */
export interface WrappedPeriod {
  readonly start: string
  readonly end: string
}

/** Reads `2026-09` or `2026` as the days it covers; anything else is undefined. */
export function periodOf(key: string): WrappedPeriod | undefined {
  if (/^\d{4}$/.test(key)) return { start: `${key}-01-01`, end: `${key}-12-31` }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return undefined
  const [year = 0, month = 1] = key.split('-').map(Number)
  const next =
    month === 12
      ? `${String(year + 1)}-01-01`
      : `${String(year)}-${String(month + 1).padStart(2, '0')}-01`
  return { start: `${key}-01`, end: shiftDay(next, -1) }
}

export interface Wrapped {
  readonly sessions: number
  readonly days: number
  readonly minutes: number
  readonly sets: number
  readonly tonnage: number
  readonly records: number
  /** The heaviest bar of the period, more reps breaking a tie. */
  readonly heaviest?: {
    readonly exerciseId: ExerciseId
    readonly load: number
    readonly reps: number
    readonly date: string
  }
  /** The loaded exercise whose top set rose furthest across the period. */
  readonly mostImproved?: BlockLift
  /** The calendar week with the most working sets. */
  readonly busiestWeek?: { readonly monday: string; readonly sets: number }
}

/**
 * A period told as a story: how much, the heaviest bar, what moved most,
 * the biggest week and the records.
 *
 * **Every figure is one another screen already gives**, reached the same
 * way: totals and records by the block report's rules, the most improved
 * exercise by its top-set change (day versions apart), the heaviest bar
 * by the records wall's tie-break. A story that computed its own numbers
 * would be a fourth opinion about the same sessions.
 */
export function wrappedFor(
  logs: readonly WorkoutLog[],
  period: WrappedPeriod,
  today: string,
): Wrapped {
  const weeks = Math.ceil(
    ((parseDay(period.end).getTime() - parseDay(period.start).getTime()) / 86_400_000 + 1) / 7,
  )
  const report = blockReport(logs, { start: period.start, end: period.end, weeks }, today)
  const inPeriod = logs.filter(
    (log) => log.status === 'completed' && log.date >= period.start && log.date <= report.through,
  )

  let heaviest: Wrapped['heaviest']
  for (const log of inPeriod) {
    for (const entry of log.entries) {
      for (const set of workingSets(entry)) {
        const load = set.actualLoad
        const reps = set.actualReps
        if (load === undefined || load <= 0 || reps === undefined) continue
        if (
          heaviest === undefined ||
          load > heaviest.load ||
          (load === heaviest.load && reps > heaviest.reps)
        ) {
          heaviest = { exerciseId: entry.exerciseId, load, reps, date: log.date }
        }
      }
    }
  }

  const byWeek = new Map<string, number>()
  for (const log of inPeriod) {
    const monday = mondayOf(log.date)
    byWeek.set(monday, (byWeek.get(monday) ?? 0) + totalWorkingSets(log))
  }
  const busiest = [...byWeek.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  const improved = report.lifts[0]

  return {
    sessions: report.sessions,
    days: new Set(inPeriod.map((log) => log.date)).size,
    minutes: inPeriod.reduce((sum, log) => sum + minutesOf(log), 0),
    sets: report.sets,
    tonnage: report.tonnage,
    records: report.records,
    ...(heaviest === undefined ? {} : { heaviest }),
    ...(improved === undefined || improved.change <= 0 ? {} : { mostImproved: improved }),
    ...(busiest === undefined ? {} : { busiestWeek: { monday: busiest[0], sets: busiest[1] } }),
  }
}

function minutesOf(log: WorkoutLog): number {
  if (log.completedAt === undefined) return 0
  const elapsed = Math.round((Date.parse(log.completedAt) - Date.parse(log.startedAt)) / 60_000)
  return elapsed > 0 ? elapsed : 0
}
