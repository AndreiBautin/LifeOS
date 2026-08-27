import { toDayKey } from '@/domain/time/day'
import type { FriendId } from '@/domain/ids/ids'

/**
 * The people in your circle, and how well it is being kept up.
 *
 * A genuinely separate life area rather than a metric, and one of the
 * better ones for a hub: contact frequency is a rating with an honest
 * threshold, and seeing somebody is an act. Nothing here is a ladder —
 * there is no top to being sociable.
 */

export interface Friend {
  readonly id: FriendId
  readonly name: string
  readonly notes?: string
  /** `YYYY-MM-DD`. Only ever moves forward — see `logHangout`. */
  readonly lastHangout: string
  readonly createdAt: string
  readonly updatedAt?: string
}

/**
 * Never deleted for going quiet.
 *
 * Dropping out of the active circle changes what `isActive` answers and
 * nothing else. The record and its history stay, and somebody becomes
 * active again the moment a recent enough date is logged — which is what
 * makes "active circle" a reading rather than a membership list somebody
 * has to curate.
 */
export function isActive(friend: Friend, thresholdMonths: number, asOf: string): boolean {
  return monthsAdded(friend.lastHangout, thresholdMonths) >= asOf
}

/** Overdue once it has been longer than the threshold since you last met. */
export function isOverdue(friend: Friend, thresholdMonths: number, asOf: string): boolean {
  return monthsAdded(friend.lastHangout, thresholdMonths) < asOf
}

export function daysSince(from: string, asOf: string): number {
  return Math.round((parseDay(asOf).getTime() - parseDay(from).getTime()) / 86_400_000)
}

/**
 * Records a hangout, forward only.
 *
 * Logging an older date than the one on file is a no-op. "Last hangout"
 * should always be the most recent meeting known, not the most recently
 * typed — otherwise correcting a forgotten coffee in March makes it look
 * like you have not seen somebody since.
 */
export function logHangout(friend: Friend, date: string): Friend {
  return date > friend.lastHangout ? { ...friend, lastHangout: date } : friend
}

function parseDay(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
}

/**
 * A date key that many months later.
 *
 * Through a real `Date` rather than string arithmetic, so month lengths
 * behave: the 31st of January plus one month lands on the 3rd of March,
 * which is what `Date` does and is close enough for a threshold measured
 * in months. What matters is that it never produces the 31st of February.
 */
function monthsAdded(key: string, months: number): string {
  const date = parseDay(key)
  date.setMonth(date.getMonth() + months)
  return toDayKey(date)
}

/**
 * A qualitative read on how big the circle is.
 *
 * "Nine active friends" says little without a sense of whether that is
 * thin or thriving. The bands are configurable rather than fixed, because
 * they came from a rough sketch and a rough sketch should be adjustable
 * by whoever is living with it.
 */
export const CIRCLE_RATINGS = ['thin', 'healthy', 'robust', 'expansive'] as const
export type CircleRating = (typeof CIRCLE_RATINGS)[number]

export const CIRCLE_RATING_LABELS: Readonly<Record<CircleRating, string>> = {
  thin: 'Thin',
  healthy: 'Healthy',
  robust: 'Robust',
  expansive: 'Expansive',
}

export interface CircleBands {
  readonly thinMax: number
  readonly healthyMax: number
  readonly robustMax: number
}

export const DEFAULT_CIRCLE_BANDS: CircleBands = { thinMax: 4, healthyMax: 8, robustMax: 14 }

export function rateCircle(activeCount: number, bands: CircleBands): CircleRating {
  if (activeCount <= bands.thinMax) return 'thin'
  if (activeCount <= bands.healthyMax) return 'healthy'
  if (activeCount <= bands.robustMax) return 'robust'
  return 'expansive'
}

/**
 * How well the active circle is being kept up, as a percentage.
 *
 * Orthogonal to its size, and both readings are needed: a small circle
 * perfectly maintained scores 100 here, and a large neglected one scores
 * low, whatever their ratings say.
 *
 * `undefined` — never zero — when there is no active circle to maintain.
 * Nobody to have neglected is not the same as having neglected everybody,
 * and a zero would drag an average down for a fact that is not true.
 */
export function maintenanceScore(
  friends: readonly Friend[],
  activeThresholdMonths: number,
  overdueThresholdMonths: number,
  asOf: string,
): number | undefined {
  const active = friends.filter((friend) => isActive(friend, activeThresholdMonths, asOf))
  if (active.length === 0) return undefined

  const keptUp = active.filter((friend) => !isOverdue(friend, overdueThresholdMonths, asOf))
  return Math.round((100 * keptUp.length) / active.length)
}

/**
 * The people you have gone longest without seeing, first.
 *
 * The ordering is the point of the screen: a list of friends alphabetised
 * tells you who you know, and a list ordered by neglect tells you who to
 * call.
 */
export function byMostOverdue(friends: readonly Friend[]): readonly Friend[] {
  return friends.toSorted((a, b) => a.lastHangout.localeCompare(b.lastHangout))
}
