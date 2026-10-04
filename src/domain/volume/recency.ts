import { MUSCLE_GROUPS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import { shiftDay } from '@/domain/time/day'

import type { VolumeMap } from './accounting'

/** How far back a muscle's sets are counted, today included. */
export const RECENCY_DAYS = 7

export type Freshness = 'worked' | 'recovering' | 'fresh'

export interface MuscleRecency {
  /** The last day it had a working set, if ever. */
  readonly lastDay?: string
  /** Whole days since then: 0 is today. */
  readonly daysAgo?: number
  /** Working sets in the last {@link RECENCY_DAYS} days. */
  readonly sets: number
  readonly freshness: Freshness
}

/**
 * Which muscles were trained lately, by days since and sets in the last
 * week (`RECENCY_DAYS`).
 *
 * **A different question from the week card's**: that one counts this
 * calendar week from Monday; this one asks how long ago, so a Sunday
 * squat still reads as yesterday on a Monday when the week card has
 * reset to nothing. The bands are plain — today or yesterday is
 * **worked**, two or three days is **recovering**, four or more, or
 * never, is **fresh** — and say nothing about readiness, which the app
 * does not measure.
 */
export function muscleRecency(
  days: readonly { readonly date: string; readonly volume: VolumeMap }[],
  today: string,
): Readonly<Record<MuscleGroup, MuscleRecency>> {
  const since = shiftDay(today, -(RECENCY_DAYS - 1))
  const result = {} as Record<MuscleGroup, MuscleRecency>
  for (const muscle of MUSCLE_GROUPS) {
    let lastDay: string | undefined
    let sets = 0
    for (const day of days) {
      const done = day.volume[muscle]
      if (done <= 0 || day.date > today) continue
      if (lastDay === undefined || day.date > lastDay) lastDay = day.date
      if (day.date >= since) sets += done
    }
    const daysAgo =
      lastDay === undefined
        ? undefined
        : Math.round((Date.parse(today) - Date.parse(lastDay)) / 86_400_000)
    result[muscle] = {
      ...(lastDay === undefined ? {} : { lastDay }),
      ...(daysAgo === undefined ? {} : { daysAgo }),
      sets,
      freshness: freshnessOf(daysAgo),
    }
  }
  return result
}

export function freshnessOf(daysAgo: number | undefined): Freshness {
  if (daysAgo === undefined || daysAgo >= 4) return 'fresh'
  return daysAgo <= 1 ? 'worked' : 'recovering'
}
