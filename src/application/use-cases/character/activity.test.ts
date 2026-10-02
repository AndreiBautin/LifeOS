import { describe, expect, it } from 'vitest'

import type { WorkoutLog } from '@/domain/logging/workout-log'
import { ALL_ACTS } from '@/domain/game/registry'
import { xpFrom } from '@/domain/game/xp'
import type { Clock } from '@/domain/repositories/ports'

import { activityFor } from './activity'
import { tallyActs, type SheetDeps } from './sheet'
import { aWorkout } from '@/test/builders/workout'

/**
 * The activity grid, which is the character sheet's tally cut by day.
 *
 * The property worth pinning is that it cannot become a second answer:
 * the cells add up to what the same records earn over the same window.
 */
function harness(workouts: readonly WorkoutLog[], now: Date): SheetDeps {
  const clock: Clock = { now: () => now }
  return {
    workouts: { all: () => Promise.resolve(workouts), recent: () => Promise.resolve(workouts) },
    clock,
  } as unknown as SheetDeps
}

/** A finished session with nothing in it pays 50 XP, on the day given. */
function trained(day: string): WorkoutLog {
  return aWorkout({ date: day, entries: [] })
}

// A Wednesday, at noon local time.
const NOW = new Date('2026-01-21T17:00:00Z')

describe('the activity grid', () => {
  it('adds up to the XP the same records earn', async () => {
    const deps = harness([trained('2026-01-05'), trained('2026-01-19'), trained('2026-01-19')], NOW)

    const activity = await activityFor(deps, 4)
    const earned = xpFrom(await tallyActs(deps), ALL_ACTS)

    expect(activity.totalXp).toBe(earned)
    expect(activity.activeDays).toBe(2)
  })

  it('runs Monday to Sunday and leaves the rest of this week empty', async () => {
    const activity = await activityFor(harness([], NOW), 2)
    const thisWeek = activity.weeks[1] ?? []

    expect(thisWeek[0]?.day).toBe('2026-01-19')
    expect(thisWeek.filter((one) => one.future).map((one) => one.day)).toEqual([
      '2026-01-22',
      '2026-01-23',
      '2026-01-24',
      '2026-01-25',
    ])
  })

  it('does not break the streak on a today with nothing in it yet', async () => {
    const activity = await activityFor(
      harness([trained('2026-01-19'), trained('2026-01-20')], NOW),
      2,
    )

    expect(activity.streak).toBe(2)
  })
})
