import { toDayKey } from '@/domain/time/day'

/**
 * Bodyweight over time.
 *
 * **Reintroduced after being deliberately removed.** The removal's own
 * reasoning stands and is worth repeating here rather than pretending it
 * was never made: a scale reading duplicates a number Apple Health or a
 * dedicated scale app already owns, and a web app has no way to read
 * HealthKit at all — there is no browser API for it, in Safari or
 * anywhere. Bringing this back does not solve either problem; it was
 * asked for anyway, knowing the cost, in place of waiting for a real
 * sync source that does not exist yet. What is here is therefore
 * deliberately small: one number, entered by hand, and a trend derived
 * from it — not the phase-and-rate machinery the original version also
 * carried, which depended on settings that no longer exist.
 */

export interface WeighIn {
  /**
   * `YYYY-MM-DD`, and the primary key.
   *
   * One weight per day, so weighing again replaces rather than appends —
   * a second reading on the same morning is a correction, not evidence.
   * It also makes the merge trivial: two devices with a reading for the
   * same day are two opinions about one fact, which last-write-wins
   * settles correctly.
   */
  readonly day: string
  /** In the lifter's own units. Nothing here converts. */
  readonly weight: number
  readonly updatedAt?: string
}

/**
 * How many days of readings the trend is smoothed over.
 *
 * Bodyweight moves several pounds a day on water, salt and what is
 * currently inside you, and none of that is the thing being measured. A
 * week is the shortest window that covers a full cycle of ordinary life
 * — a weekend, a heavy training day, a rest day — so it is the shortest
 * one whose movement means anything.
 */
export const TREND_DAYS = 7

function mean(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  return values.reduce((total, value) => total + value, 0) / values.length
}

/**
 * The readings sorted oldest to newest, deduplicated by day (later write
 * wins, matching the repository's own last-write-wins rule for a given
 * key — this only matters if two rows for one day somehow both reach the
 * caller, which a real repository never hands back).
 */
export function ordered(weighIns: readonly WeighIn[]): readonly WeighIn[] {
  return [...weighIns].sort((a, b) => a.day.localeCompare(b.day))
}

/**
 * The smoothed weight right now, and the day it was smoothed over. Absent
 * when there is nothing to average — never zero, which would claim a
 * reading that was never taken.
 */
export function currentTrend(
  weighIns: readonly WeighIn[],
  today: Date,
): { readonly value: number; readonly readings: number } | undefined {
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - TREND_DAYS)
  const cutoffKey = toDayKey(cutoff)

  const recent = ordered(weighIns).filter((row) => row.day > cutoffKey)
  const value = mean(recent.map((row) => row.weight))
  if (value === undefined) return undefined

  return { value, readings: recent.length }
}
