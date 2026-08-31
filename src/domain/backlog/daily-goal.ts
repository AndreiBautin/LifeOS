import { cadenceCovers, isPlausibleCadence, type Cadence } from '@/domain/dailies/daily'

import { BacklogValidationError } from './errors'

/**
 * A per-day target attached to an item — "1 chapter", "2 episodes", "1 level".
 * `unit` is free text so it can describe whatever the item is made of; only
 * the category registry's `suggestedGoalUnit` nudges it toward a convention.
 */
export interface DailyGoal {
  readonly amount: number
  readonly unit: string
  /**
   * Which days the goal is expected on. Absent means every day.
   *
   * **The same `Cadence` the habits use, deliberately reused rather than
   * reinvented.** It answers "was this expected on this date" from the
   * date alone, which is the property that makes a streak a walk
   * backwards — and a second implementation of that question is a bug
   * with a delay on it.
   *
   * Without it a reading goal meant *every* day, so somebody who reads
   * on Tuesdays and Thursdays had a broken streak five days a week and a
   * board that said they were behind on a book they were not behind on.
   * A goal you cannot help but fail is one you stop logging.
   *
   * Absent rather than defaulted to every-day in storage, because every
   * goal written before this existed has no cadence and reads correctly
   * as "no restriction" — the same concession every optional field in
   * the backup makes.
   */
  readonly cadence?: Cadence
}

/**
 * One day's logged progress. `date` is a *local* calendar day key
 * (`YYYY-MM-DD`), not an ISO timestamp: a daily goal is a human, local-clock
 * concept, so "today" must not roll over at UTC midnight for the user.
 */
export interface DailyProgressEntry {
  readonly date: string
  readonly amount: number
}

export interface DailyGoalInput {
  amount: number
  unit: string
  cadence?: Cadence
}

export const MAX_GOAL_AMOUNT = 99
const MAX_UNIT_LENGTH = 24
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Formats a Date as the local calendar day it falls on. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isDateKey(value: string): boolean {
  return DATE_KEY_PATTERN.test(value)
}

function requireDateKey(value: string): string {
  if (!isDateKey(value)) {
    throw new BacklogValidationError(`Invalid date key: ${value}`)
  }
  return value
}

/**
 * Calendar-day arithmetic on a date key. Goes through a local `Date` and
 * `setDate` so day boundaries stay correct across months, years, leap days,
 * and daylight-saving shifts (where a day is not 24 hours long).
 */
export function shiftDateKey(key: string, days: number): string {
  const [year, month, day] = requireDateKey(key).split('-').map(Number)
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

export function requireDailyGoal(input: DailyGoalInput): DailyGoal {
  const unit = input.unit.trim()
  if (unit.length === 0) {
    throw new BacklogValidationError('Daily goal unit is required')
  }
  if (unit.length > MAX_UNIT_LENGTH) {
    throw new BacklogValidationError(
      `Daily goal unit must be ${MAX_UNIT_LENGTH.toString()} characters or fewer`,
    )
  }
  if (!Number.isInteger(input.amount) || input.amount < 1) {
    throw new BacklogValidationError('Daily goal amount must be a whole number of 1 or more')
  }
  if (input.amount > MAX_GOAL_AMOUNT) {
    throw new BacklogValidationError(
      `Daily goal amount must be ${MAX_GOAL_AMOUNT.toString()} or fewer`,
    )
  }
  return {
    amount: input.amount,
    unit,
    ...(input.cadence === undefined ? {} : { cadence: input.cadence }),
  }
}

/**
 * Whether a goal is expected on a day. No cadence means every day.
 *
 * The one place the cadence is read, so every caller -- the streak, the
 * board, the day strip -- agrees about which days count.
 */
export function goalCovers(goal: DailyGoal, dateKey: string): boolean {
  return goal.cadence === undefined || cadenceCovers(goal.cadence, dateKey)
}

/** "1 chapter/day", "2 episodes/day" — naive pluralization, skipped if already plural. */
export function formatDailyGoal(goal: DailyGoal): string {
  const plural = goal.amount === 1 || goal.unit.endsWith('s') ? goal.unit : `${goal.unit}s`
  return `${goal.amount.toString()} ${plural}/day`
}

export function getProgressOn(entries: readonly DailyProgressEntry[], dateKey: string): number {
  return entries.find((entry) => entry.date === dateKey)?.amount ?? 0
}

/**
 * Applies a signed change to one day's progress, keeping the log sorted and
 * sparse: a day is only stored once it has progress, and drops back out of
 * the log when it returns to zero (so "undo" leaves no trace behind).
 */
export function applyProgressDelta(
  entries: readonly DailyProgressEntry[],
  dateKey: string,
  delta: number,
): DailyProgressEntry[] {
  requireDateKey(dateKey)
  if (!Number.isInteger(delta)) {
    throw new BacklogValidationError('Progress delta must be a whole number')
  }

  const nextAmount = Math.max(0, getProgressOn(entries, dateKey) + delta)
  const others = entries.filter((entry) => entry.date !== dateKey)
  const next = nextAmount === 0 ? others : [...others, { date: dateKey, amount: nextAmount }]

  return next.sort((a, b) => a.date.localeCompare(b.date))
}

export function isPlausibleDailyGoal(value: unknown): value is DailyGoal {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<Record<keyof DailyGoal, unknown>>
  return (
    typeof candidate.unit === 'string' &&
    candidate.unit.trim().length > 0 &&
    typeof candidate.amount === 'number' &&
    Number.isInteger(candidate.amount) &&
    candidate.amount >= 1 &&
    // Absent is fine -- it means every day. Present and malformed is not:
    // `cadenceCovers` reads `days.includes`, so a `days` that is a string
    // throws rather than degrading.
    (candidate.cadence === undefined || isPlausibleCadence(candidate.cadence))
  )
}

export function isPlausibleProgressEntry(value: unknown): value is DailyProgressEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<Record<keyof DailyProgressEntry, unknown>>
  return (
    typeof candidate.date === 'string' &&
    isDateKey(candidate.date) &&
    typeof candidate.amount === 'number' &&
    Number.isInteger(candidate.amount) &&
    candidate.amount > 0
  )
}
