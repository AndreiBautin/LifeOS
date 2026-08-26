import { getProgressOn, shiftDateKey, toDateKey, type DailyGoal } from './daily-goal'
import type { Item } from './item'

/** How many days the Goals page's history strip shows. */
export const RECENT_DAY_COUNT = 14

export interface DailyGoalDay {
  readonly date: string
  readonly amount: number
  readonly isMet: boolean
}

export interface DailyGoalStatus {
  readonly item: Item
  readonly goal: DailyGoal
  readonly loggedToday: number
  readonly target: number
  readonly isMet: boolean
  readonly currentStreak: number
  readonly longestStreak: number
  /** Oldest-first window ending today, for the history strip. */
  readonly recentDays: readonly DailyGoalDay[]
}

export interface DailyGoalBoard {
  readonly statuses: readonly DailyGoalStatus[]
  readonly metCount: number
  readonly totalCount: number
  readonly allMet: boolean
}

interface GoalItem extends Item {
  readonly dailyGoal: DailyGoal
}

/**
 * A daily goal only applies to something you're actually working through, so
 * a goal on a paused or backlogged item stays configured but stops nagging.
 */
function isTracked(item: Item): item is GoalItem {
  return item.status === 'currently-using' && item.dailyGoal !== undefined
}

function metOn(item: GoalItem, dateKey: string): boolean {
  return getProgressOn(item.dailyProgress, dateKey) >= item.dailyGoal.amount
}

/**
 * Consecutive met days ending today — or ending yesterday, when today hasn't
 * been logged yet. The grace day is deliberate: a streak should only die once
 * a day has been fully missed, not the moment a new day begins.
 */
function getCurrentStreak(item: GoalItem, todayKey: string): number {
  let cursor = metOn(item, todayKey) ? todayKey : shiftDateKey(todayKey, -1)

  let streak = 0
  while (metOn(item, cursor)) {
    streak += 1
    cursor = shiftDateKey(cursor, -1)
  }
  return streak
}

function getLongestStreak(item: GoalItem): number {
  const metDays = item.dailyProgress
    .filter((entry) => entry.amount >= item.dailyGoal.amount)
    .map((entry) => entry.date)
    .sort((a, b) => a.localeCompare(b))

  let longest = 0
  let run = 0
  let previous: string | null = null

  for (const day of metDays) {
    run = previous !== null && shiftDateKey(previous, 1) === day ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = day
  }
  return longest
}

function getRecentDays(item: GoalItem, todayKey: string, dayCount: number): DailyGoalDay[] {
  return Array.from({ length: dayCount }, (_unused, index) => {
    const date = shiftDateKey(todayKey, index - (dayCount - 1))
    const amount = getProgressOn(item.dailyProgress, date)
    return { date, amount, isMet: amount >= item.dailyGoal.amount }
  })
}

function toStatus(item: GoalItem, todayKey: string, dayCount: number): DailyGoalStatus {
  const loggedToday = getProgressOn(item.dailyProgress, todayKey)

  return {
    item,
    goal: item.dailyGoal,
    loggedToday,
    target: item.dailyGoal.amount,
    isMet: loggedToday >= item.dailyGoal.amount,
    currentStreak: getCurrentStreak(item, todayKey),
    longestStreak: getLongestStreak(item),
    recentDays: getRecentDays(item, todayKey, dayCount),
  }
}

/**
 * Powers the daily check-in: what's due today across everything in progress,
 * how much of it is done, and the streak behind each one.
 */
export function getDailyGoalBoard(
  items: readonly Item[],
  now: Date,
  recentDayCount: number = RECENT_DAY_COUNT,
): DailyGoalBoard {
  const todayKey = toDateKey(now)

  const statuses = items
    .filter(isTracked)
    .map((item) => toStatus(item, todayKey, recentDayCount))
    .sort((a, b) => a.item.title.localeCompare(b.item.title))

  const metCount = statuses.filter((status) => status.isMet).length

  return {
    statuses,
    metCount,
    totalCount: statuses.length,
    allMet: statuses.length > 0 && metCount === statuses.length,
  }
}
