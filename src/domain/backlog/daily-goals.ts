import { getProgressOn, goalCovers, shiftDateKey, toDateKey, type DailyGoal } from './daily-goal'
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
  /**
   * Whether the goal is expected today at all.
   *
   * Reported rather than filtered out, so a caller can decide. The board
   * counts only what is due towards `metCount`, and the Codex screen
   * still shows the rest — logging on a day you did not plan to read is
   * a thing that happens, and an item that vanished on Wednesday would
   * read as lost rather than as not due.
   */
  readonly isDueToday: boolean
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
 * Consecutive met days ending today, counting only the days the goal was
 * expected on.
 *
 * Two rules, and they are deliberately the same two `streakFor` holds for
 * habits — this is the same question about a different record, and two
 * different answers to it on two screens would be worse than either.
 *
 * **A day the goal was not expected on does not break it.** Somebody who
 * reads on Tuesdays and Thursdays was previously failing five days a
 * week, which made the streak a number that could only ever be one.
 *
 * **Today does not break it until the day is over.** An unlogged today
 * is skipped; an unlogged yesterday is not.
 *
 * The walk is bounded rather than `while`-looped, because a cadence of
 * `days-of-week: []` is expected on nothing and would otherwise spin
 * forever looking for a day that never comes.
 */
function getCurrentStreak(item: GoalItem, todayKey: string): number {
  let streak = 0
  let cursor = todayKey

  // A year is far past the point where a streak means anything, and it
  // bounds the walk on a record with a corrupt date.
  for (let step = 0; step < 366; step += 1) {
    if (goalCovers(item.dailyGoal, cursor)) {
      if (metOn(item, cursor)) {
        streak += 1
      } else if (cursor !== todayKey) {
        return streak
      }
      // An unmet *today* falls through: the day is not over.
    }
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
    // A day the goal was never expected on is not a miss on the strip
    // either -- it reads as met, the way an off day does for a habit.
    return {
      date,
      amount,
      isMet: amount >= item.dailyGoal.amount || !goalCovers(item.dailyGoal, date),
    }
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
    isDueToday: goalCovers(item.dailyGoal, todayKey),
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

  /*
   * Counted over what is *due*, not over everything tracked.
   *
   * "2 of 5" on a Wednesday when three of the five are Tuesday goals is
   * a number that reads as being behind while nothing is outstanding —
   * the same defect the Today screen had when it listed habits that
   * were not due. A goal not expected today is neither met nor missed.
   */
  const due = statuses.filter((status) => status.isDueToday)
  const metCount = due.filter((status) => status.isMet).length

  return {
    statuses,
    metCount,
    totalCount: due.length,
    allMet: due.length > 0 && metCount === due.length,
  }
}
