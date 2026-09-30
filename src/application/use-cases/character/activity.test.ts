import { describe, expect, it } from 'vitest'

import type { Place } from '@/domain/atlas/place/Place'
import { ALL_ACTS } from '@/domain/game/registry'
import { xpFrom } from '@/domain/game/xp'
import type { Clock } from '@/domain/repositories/ports'

import { activityFor } from './activity'
import { tallyActs, type SheetDeps } from './sheet'

/**
 * The activity grid, which is the character sheet's tally cut by day.
 *
 * The property worth pinning is that it cannot become a second answer:
 * the cells add up to what the same records earn over the same window.
 * The suite runs in America/New_York, which is what makes the evening
 * case below mean anything — in UTC a timestamp's date and the local day
 * are the same ten characters.
 */
function harness(places: readonly Place[], now: Date): SheetDeps {
  const clock: Clock = { now: () => now }
  const list = <T>(rows: readonly T[]) => ({
    all: () => Promise.resolve(rows),
    recent: () => Promise.resolve(rows),
  })
  return {
    items: list([]),
    attempts: list([]),
    challenges: list([]),
    projects: list([]),
    workouts: list([]),
    places: list(places),
    clock,
  } as unknown as SheetDeps
}

/** A visited place pays 20 XP on the day it was visited. */
function visited(id: string, when: string): Place {
  return {
    id,
    name: `Place ${id}`,
    categoryId: 'food',
    status: 'visited',
    location: { coordinates: { latitude: 51.5, longitude: -0.1 } },
    favorite: false,
    tags: [],
    dateAdded: '2025-01-01T00:00:00.000Z',
    dateVisited: when,
  } as unknown as Place
}

// A Wednesday, at noon local time.
const NOW = new Date('2026-01-21T17:00:00Z')

describe('the activity grid', () => {
  it('adds up to the XP the same records earn', async () => {
    const places = [
      visited('a', '2026-01-05'),
      visited('b', '2026-01-19'),
      visited('c', '2026-01-19'),
    ]
    const deps = harness(places, NOW)

    const activity = await activityFor(deps, 4)
    const earned = xpFrom(await tallyActs(deps), ALL_ACTS)

    expect(activity.totalXp).toBe(earned)
    expect(activity.activeDays).toBe(2)
  })

  it('files an evening timestamp under the local day, not the UTC one', async () => {
    // 21:00 in New York on the 19th is 02:00 UTC on the 20th.
    const activity = await activityFor(harness([visited('a', '2026-01-20T02:00:00.000Z')], NOW), 1)

    const days = activity.weeks.flat()
    expect(days.find((one) => one.day === '2026-01-19')?.xp).toBe(20)
    expect(days.find((one) => one.day === '2026-01-20')?.xp).toBe(0)
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
      harness([visited('a', '2026-01-19'), visited('b', '2026-01-20')], NOW),
      2,
    )

    expect(activity.streak).toBe(2)
  })
})
