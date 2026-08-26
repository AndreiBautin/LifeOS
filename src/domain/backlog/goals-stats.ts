import type { Item } from './item'
import { getCompletionStats } from './completion-stats'

export interface GoalsStats {
  readonly currentStreak: number
  readonly completedThisMonth: number
  readonly completedThisYear: number
  readonly averageCompletionsPerMonth: number
  readonly averageBacklogAgeDays: number
  readonly oldestUnfinishedItem: Item | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Items still pending a decision — not yet completed, and not abandoned. */
function isUnfinished(item: Item): boolean {
  return item.status !== 'completed' && item.status !== 'dropped'
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear().toString()}-${date.getUTCMonth().toString()}`
}

function monthsBetween(earlier: Date, later: Date): number {
  return (
    (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12 +
    (later.getUTCMonth() - earlier.getUTCMonth())
  )
}

function getCompletedDates(items: readonly Item[]): Date[] {
  return items
    .filter(
      (item): item is Item & { dateCompleted: string } =>
        item.status === 'completed' && item.dateCompleted !== undefined,
    )
    .map((item) => new Date(item.dateCompleted))
}

/**
 * Consecutive months with at least one completion, counting back from the
 * current month. If the current month itself has no completion yet, the
 * streak is 0 — it must include "now" to be current.
 */
function getCurrentStreak(completedDates: readonly Date[], now: Date): number {
  const completedMonths = new Set(completedDates.map(monthKey))

  let streak = 0
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  while (completedMonths.has(monthKey(cursor))) {
    streak += 1
    cursor.setUTCMonth(cursor.getUTCMonth() - 1)
  }
  return streak
}

function getAverageCompletionsPerMonth(completedDates: readonly Date[], now: Date): number {
  if (completedDates.length === 0) {
    return 0
  }
  const earliest = completedDates.reduce((min, date) => (date < min ? date : min))
  const monthsSpan = monthsBetween(earliest, now) + 1
  return Math.round((completedDates.length / monthsSpan) * 10) / 10
}

function getAverageBacklogAgeDays(unfinished: readonly Item[], now: Date): number {
  if (unfinished.length === 0) {
    return 0
  }
  const totalDays = unfinished.reduce(
    (sum, item) => sum + (now.getTime() - new Date(item.dateAdded).getTime()) / DAY_MS,
    0,
  )
  return Math.round(totalDays / unfinished.length)
}

function getOldestUnfinishedItem(unfinished: readonly Item[]): Item | null {
  if (unfinished.length === 0) {
    return null
  }
  return unfinished.reduce((oldest, item) => (item.dateAdded < oldest.dateAdded ? item : oldest))
}

/** Powers the Goals view: streaks and backlog-aging stats that encourage finishing things. */
export function getGoalsStats(items: readonly Item[], now: Date): GoalsStats {
  const { completedThisMonth, completedThisYear } = getCompletionStats(items, now)
  const completedDates = getCompletedDates(items)
  const unfinished = items.filter(isUnfinished)

  return {
    currentStreak: getCurrentStreak(completedDates, now),
    completedThisMonth,
    completedThisYear,
    averageCompletionsPerMonth: getAverageCompletionsPerMonth(completedDates, now),
    averageBacklogAgeDays: getAverageBacklogAgeDays(unfinished, now),
    oldestUnfinishedItem: getOldestUnfinishedItem(unfinished),
  }
}
