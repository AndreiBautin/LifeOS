import {
  averageOf,
  recordDay,
  recordedCount,
  type DayFigure,
  type DayReading,
} from '@/domain/vitals/day-reading'
import { shiftDay } from '@/domain/dailies/daily'
import type { Clock, DayReadingRepository } from '@/domain/repositories/ports'
import { toDayKey } from '@/domain/time/day'

/**
 * Days, from the application's side.
 *
 * **It pays no XP, and that is the weigh-in's call again.** Typing in
 * what you slept and what you ate is a *measurement* — the app already
 * refuses to pay for standing on a scale, and paying for a good night
 * would be paying for an outcome, which is the streak mistake in a new
 * costume. What it feeds is the reading, not the score.
 */

export interface DayDeps {
  readonly dayReadings: DayReadingRepository
  readonly clock: Clock
}

/**
 * How far back a summary looks.
 *
 * A fortnight, because that is the window the weight trend already
 * compares over and the two are read together — "how is the cut going"
 * is a question about the same stretch of days.
 */
export const SUMMARY_DAYS = 14

export async function recordToday(
  changes: Partial<Record<DayFigure, number | null>>,
  deps: DayDeps,
): Promise<void> {
  const day = toDayKey(deps.clock.now())
  const existing = await deps.dayReadings.byDay(day)
  const next = recordDay(existing, day, changes)

  // Identity means nothing moved — no write, no sync traffic, and no
  // stamp making this device look newer than one that really changed
  // something.
  if (next === existing) return

  await deps.dayReadings.save(next)
}

export interface DaySummary {
  readonly today: DayReading | undefined
  readonly recent: readonly DayReading[]
  /** Averages over the window, absent for anything nobody recorded. */
  readonly averages: Partial<Record<DayFigure, number>>
  /** How many of the window's days carry each figure. */
  readonly counts: Partial<Record<DayFigure, number>>
  readonly windowDays: number
}

export async function daySummary(deps: DayDeps): Promise<DaySummary> {
  const today = toDayKey(deps.clock.now())
  const from = shiftDay(today, -(SUMMARY_DAYS - 1))

  const all = await deps.dayReadings.all()
  const recent = all
    .filter((one) => one.day >= from && one.day <= today)
    .sort((a, b) => a.day.localeCompare(b.day))

  const averages: Partial<Record<DayFigure, number>> = {}
  const counts: Partial<Record<DayFigure, number>> = {}

  for (const figure of [
    'sleepHours',
    'calories',
    'proteinGrams',
    'carbGrams',
    'fatGrams',
  ] as const) {
    const mean = averageOf(recent, figure)
    if (mean !== undefined) averages[figure] = mean

    const count = recordedCount(recent, figure)
    if (count > 0) counts[figure] = count
  }

  return {
    today: recent.find((one) => one.day === today),
    recent,
    averages,
    counts,
    windowDays: SUMMARY_DAYS,
  }
}
