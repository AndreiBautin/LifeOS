import { describe, expect, it } from 'vitest'

import { toCellId, type CellId } from '@/domain/atlas/exploration/GeoCell'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import type { Clock } from '@/domain/repositories/ports'
import { DEFAULT_SETTINGS, type AppSettings } from '@/domain/settings/settings'

import { measureAll, type MeasureDeps } from './measure'

/**
 * The exploration reading, which is the one measurement in the hub whose
 * denominator the app cannot work out for itself.
 *
 * Everything else here counts something it owns. This divides by a number
 * a person typed, which makes "what happens when they have not typed one"
 * the question worth pinning.
 */
function harness(region: number | undefined, cells: readonly Coordinates[]) {
  const clock: Clock = { now: () => new Date(2026, 7, 26, 9, 0) }
  const walked = new Set<CellId>(cells.map(toCellId))

  const empty = {
    all: () => Promise.resolve([]),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    saveMany: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    count: () => Promise.resolve(0),
  }

  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(region === undefined ? {} : { exploredRegionKm2: region }),
  }

  const deps = {
    items: empty,
    projects: empty,
    upgrades: empty,
    workouts: empty,
    friends: empty,
    places: empty,
    dailies: empty,
    rooms: empty,
    vices: empty,
    finance: empty,
    attempts: empty,
    explored: {
      all: () => Promise.resolve(walked),
      reveal: () => Promise.resolve(0),
      clear: () => Promise.resolve(),
      count: () => Promise.resolve(walked.size),
    },
    settings: { get: () => Promise.resolve(settings), save: () => Promise.resolve() },
    clock,
  } as unknown as MeasureDeps

  return deps
}

const LONDON: Coordinates = { latitude: 51.5074, longitude: -0.1278 }

/** Cells are ~153 m across, so this walks a line of distinct ones. */
function walkOf(count: number): Coordinates[] {
  return Array.from({ length: count }, (_, step) => ({
    latitude: LONDON.latitude + step * 0.004,
    longitude: LONDON.longitude,
  }))
}

describe('the exploration reading', () => {
  /*
   * The important one. No region means no denominator, and a reading of
   * zero would be a claim — that this month's exploration was nothing —
   * where the truth is that nobody has said what "all of it" means. The
   * spine skips absent readings precisely so an evaluator is never handed
   * a fabricated number.
   */
  it('is absent when no region has been set', async () => {
    const measured = await measureAll(harness(undefined, walkOf(10)))

    expect(measured['places.explored-share']).toBeUndefined()
  })

  it('is a share of the region once one is set', async () => {
    const measured = await measureAll(harness(1, walkOf(10)))
    const share = measured['places.explored-share']

    expect(share).toBeGreaterThan(0)
    expect(share).toBeLessThanOrEqual(1)
  })

  /*
   * Walking more ground than the region you named means the region was
   * named too small, not that you are 140 per cent explored — and a ladder
   * handed 1.4 would read as beyond its own top rung.
   */
  it('never reports more than all of it', async () => {
    const measured = await measureAll(harness(0.001, walkOf(40)))

    expect(measured['places.explored-share']).toBe(1)
  })

  it('reads zero-ish rather than dividing by nothing on a region of zero', async () => {
    // Zero is refused at the settings field, but a hand-edited or synced
    // settings blob can still carry one, and `x / 0` is `Infinity` — a
    // number that would sail through every check the spine makes.
    const measured = await measureAll(harness(0, walkOf(5)))

    expect(measured['places.explored-share']).toBeUndefined()
  })

  /*
   * Zero here is a real reading rather than a missing one, and the
   * distinction is the whole point of the rule above: with a region named,
   * "none of it walked" is something the app genuinely knows.
   */
  it('reads zero — not absent — when a region is set and nothing walked', async () => {
    const measured = await measureAll(harness(1572, []))

    expect(measured['places.explored-share']).toBe(0)
  })
})
