import { describe, expect, it } from 'vitest'

import { ALL_ACTS } from '@/domain/game/registry'
import { xpFrom } from '@/domain/game/xp'
import type { Place } from '@/domain/atlas/place/Place'
import type { Clock, ReviewRepository } from '@/domain/repositories/ports'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'

import { seasonProgressFor } from './season-progress'
import { tallyActs, type SheetDeps } from './sheet'

/**
 * The season, which is derived rather than recorded.
 *
 * What is worth pinning here is not the arithmetic but the two properties
 * a viewer would notice were broken: that a season counts only its own
 * months, and that all-time equals the sum of the seasons. The second is
 * the reason an undated act counts nowhere at all.
 */
function harness(places: Place[], now: Date) {
  const clock: Clock = { now: () => now }

  const list = <T>(rows: readonly T[]) => ({
    all: () => Promise.resolve(rows),
    recent: () => Promise.resolve(rows),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    saveMany: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    count: () => Promise.resolve(rows.length),
  })

  const review: ReviewRepository = {
    metrics: () => Promise.resolve([]),
    saveMetric: () => Promise.resolve(),
    removeMetric: () => Promise.resolve(),
    restoreMetrics: () => Promise.resolve(),
    snapshots: () => Promise.resolve([]),
    snapshot: () => Promise.resolve(undefined),
    saveSnapshot: () => Promise.resolve(),
    restoreSnapshots: () => Promise.resolve(),
    removeSnapshot: () => Promise.resolve(),
    purgeSnapshot: () => Promise.resolve(),
  }

  return {
    items: list([]),
    attempts: list([]),
    challenges: list([]),
    projects: list([]),
    upgrades: list([]),
    workouts: list([]),
    friends: list([]),
    places: list(places),
    dailies: list([]),
    explored: {
      all: () => Promise.resolve(new Set()),
      reveal: () => Promise.resolve(0),
      clear: () => Promise.resolve(),
      count: () => Promise.resolve(0),
    },
    settings: { get: () => Promise.resolve(DEFAULT_SETTINGS), save: () => Promise.resolve() },
    review,
    clock,
  } as unknown as SheetDeps
}

/** A visited place is worth 20 XP, on the day given. */
function visitedOn(id: string, isoDate: string): Place {
  return {
    id,
    name: `Place ${id}`,
    categoryId: 'food',
    status: 'visited',
    location: { coordinates: { latitude: 51.5, longitude: -0.1 } },
    favorite: false,
    tags: [],
    dateAdded: '2025-01-01T00:00:00.000Z',
    dateVisited: isoDate,
  } as unknown as Place
}

const MID_WINTER = new Date('2026-01-20T12:00:00Z')

describe('what a season counts', () => {
  /*
   * December and January are the same winter. Counting by calendar year
   * instead would split a season in half at the worst possible moment and
   * reset somebody's progress on New Year's Day.
   */
  it('counts December and January together', async () => {
    const deps = harness(
      [visitedOn('a', '2025-12-20T00:00:00.000Z'), visitedOn('b', '2026-01-05T00:00:00.000Z')],
      MID_WINTER,
    )

    expect((await seasonProgressFor(deps)).xp).toBe(40)
  })

  it('leaves out anything from another season', async () => {
    const deps = harness(
      [visitedOn('a', '2026-01-05T00:00:00.000Z'), visitedOn('b', '2025-07-01T00:00:00.000Z')],
      MID_WINTER,
    )

    expect((await seasonProgressFor(deps)).xp).toBe(20)
  })

  it('breaks the season into its three months, including ones not yet begun', async () => {
    const deps = harness([visitedOn('a', '2025-12-20T00:00:00.000Z')], MID_WINTER)

    const progress = await seasonProgressFor(deps)

    expect(progress.months.map((one) => one.month)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(progress.months.map((one) => one.xp)).toEqual([20, 0, 0])
  })

  it('names the season the way somebody would say it', async () => {
    const progress = await seasonProgressFor(harness([], MID_WINTER))

    expect(progress.label).toBe('Winter 2026')
  })
})

describe('the target', () => {
  /*
   * Last season's XP, because a tier curve would be a scale the app
   * invented — the one thing the game model refuses everywhere else.
   */
  it('is what the previous season earned', async () => {
    const deps = harness(
      [
        // Autumn 2025 is the season before winter 2026.
        visitedOn('a', '2025-10-01T00:00:00.000Z'),
        visitedOn('b', '2025-11-01T00:00:00.000Z'),
        visitedOn('c', '2026-01-05T00:00:00.000Z'),
      ],
      MID_WINTER,
    )

    const progress = await seasonProgressFor(deps)

    expect(progress.target).toBe(40)
    expect(progress.xp).toBe(20)
  })

  /*
   * Absent rather than zero: "beat 0 XP" is not a goal, and a bar already
   * full on the first day of the first season is worse than no bar.
   */
  it('is absent when the previous season earned nothing', async () => {
    const deps = harness([visitedOn('a', '2026-01-05T00:00:00.000Z')], MID_WINTER)

    expect((await seasonProgressFor(deps)).target).toBeUndefined()
  })
})

describe('all-time and the seasons agree', () => {
  /*
   * The invariant that makes an undated act count nowhere at all. If one
   * were counted in the total and never in a season, two numbers on the
   * same screen would quietly disagree and nothing would say why.
   */
  it('sums the seasons to the all-time total', async () => {
    const places = [
      visitedOn('a', '2025-12-20T00:00:00.000Z'),
      visitedOn('b', '2026-01-05T00:00:00.000Z'),
      visitedOn('c', '2025-07-01T00:00:00.000Z'),
      visitedOn('d', '2025-10-01T00:00:00.000Z'),
    ]
    const deps = harness(places, MID_WINTER)

    const allTime = xpFrom(await tallyActs(deps), ALL_ACTS)
    const seasons = ['2025-07', '2025-10', '2025-12', '2026-01'].map(async (month) =>
      xpFrom(await tallyActs(deps, (date) => date.slice(0, 7) === month), ALL_ACTS),
    )
    const summed = (await Promise.all(seasons)).reduce((total, xp) => total + xp, 0)

    expect(summed).toBe(allTime)
    expect(allTime).toBe(80)
  })

  it('excludes an act with no date from the all-time total too', async () => {
    const undated = { ...visitedOn('a', ''), dateVisited: undefined } as unknown as Place
    const deps = harness([undated, visitedOn('b', '2026-01-05T00:00:00.000Z')], MID_WINTER)

    expect(xpFrom(await tallyActs(deps), ALL_ACTS)).toBe(20)
  })
})

describe('where in the season we are', () => {
  it('reports elapsed time and days left', async () => {
    const progress = await seasonProgressFor(harness([], MID_WINTER))

    expect(progress.elapsed).toBeGreaterThan(0.4)
    expect(progress.elapsed).toBeLessThan(0.7)
    expect(progress.daysLeft).toBeGreaterThan(35)
    expect(progress.daysLeft).toBeLessThan(45)
  })
})
