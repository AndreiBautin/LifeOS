import { describe, expect, it } from 'vitest'

import type { Place } from '@/domain/atlas/place/Place'
import type { Trip } from '@/domain/atlas/trip/Trip'
import type { TripId } from '@/domain/atlas/trip/TripId'
import type { Clock, PlaceRepository, TripRepository } from '@/domain/repositories/ports'

import { addPlace, type AtlasDeps } from './atlas'
import {
  addTrip,
  placeOffTrip,
  placeOnTrip,
  removeTrip,
  tripStatus,
  tripViews,
  type TripDeps,
} from './trips'

function harness(today = new Date('2026-08-27T09:00:00.000Z')) {
  const tripStore = new Map<string, Trip>()
  const placeStore = new Map<string, Place>()
  let sequence = 0

  const clock: Clock = { now: () => today }

  const trips: TripRepository = {
    all: () => Promise.resolve([...tripStore.values()]),
    byId: (id) => Promise.resolve(tripStore.get(id as string)),
    save: (trip) => {
      tripStore.set(trip.id, { ...trip, updatedAt: clock.now().toISOString() })
      return Promise.resolve()
    },
    restoreMany: () => Promise.resolve(),
    remove: (id) => {
      tripStore.delete(id)
      return Promise.resolve()
    },
    purge: () => Promise.resolve(),
  }

  const places: PlaceRepository = {
    all: () => Promise.resolve([...placeStore.values()]),
    byId: (id) => Promise.resolve(placeStore.get(id as string)),
    save: (place) => {
      placeStore.set(place.id, place)
      return Promise.resolve()
    },
    restoreMany: () => Promise.resolve(),
    remove: (id) => {
      placeStore.delete(id)
      return Promise.resolve()
    },
    purge: () => Promise.resolve(),
    count: () => Promise.resolve(placeStore.size),
  }

  const ids = {
    next: () => {
      sequence += 1
      return `id-${sequence.toString()}`
    },
  }

  const deps: TripDeps = { trips, places, clock, ids }
  const atlas: AtlasDeps = {
    places,
    explored: {
      all: () => Promise.resolve(new Set()),
      reveal: () => Promise.resolve(0),
      clear: () => Promise.resolve(),
      count: () => Promise.resolve(0),
    },
    clock,
    ids,
  }

  return { deps, atlas, tripStore, placeStore }
}

const DATED = { name: 'Lisbon', location: 'Portugal' } as const

describe('when a trip is', () => {
  /*
   * Both bounds inclusive. A trip that ends today is still on today — an
   * exclusive end files the last morning of a holiday under "past", which
   * is the sort of small wrongness that makes an app feel like it is
   * arguing with you.
   */
  it('is current on its last day, not past', () => {
    const trip = { startDate: '2026-08-20', endDate: '2026-08-27' } as Trip

    expect(tripStatus(trip, '2026-08-27')).toBe('current')
  })

  it('is current on its first day', () => {
    const trip = { startDate: '2026-08-27', endDate: '2026-08-30' } as Trip

    expect(tripStatus(trip, '2026-08-27')).toBe('current')
  })

  it('treats a one-sided range as a single day', () => {
    const trip = { startDate: '2026-09-01' } as Trip

    expect(tripStatus(trip, '2026-08-27')).toBe('upcoming')
    expect(tripStatus(trip, '2026-09-02')).toBe('past')
  })

  it('has no status without dates', () => {
    expect(tripStatus({} as Trip, '2026-08-27')).toBe('undated')
  })
})

describe('a trip and its places', () => {
  it('counts what is visited and what still has no point', async () => {
    const { deps, atlas } = harness()
    const trip = await addTrip(DATED, deps)
    const id = trip.trip?.id
    if (id === undefined) throw new Error(trip.error)

    const unplaced = await addPlace({ name: 'A bar', categoryId: 'food' as never }, atlas)
    const placed = await addPlace(
      { name: 'A park', categoryId: 'outdoors' as never, latitude: 38.7, longitude: -9.1 },
      atlas,
    )
    if (unplaced.place === undefined || placed.place === undefined) throw new Error('setup')

    await placeOnTrip(id, unplaced.place.id, deps)
    await placeOnTrip(id, placed.place.id, deps)

    const [view] = await tripViews(deps)
    expect(view?.places).toHaveLength(2)
    expect(view?.unplaced).toBe(1)
  })

  /*
   * A trip holds ids, so taking somewhere off an itinerary must not be the
   * thing that deletes it — which is why the two operations have separate
   * names rather than one function with a flag.
   */
  it('leaves the place alone when it comes off the trip', async () => {
    const { deps, atlas, placeStore } = harness()
    const trip = await addTrip(DATED, deps)
    const added = await addPlace({ name: 'A bar', categoryId: 'food' as never }, atlas)
    const id = trip.trip?.id
    if (id === undefined || added.place === undefined) throw new Error('setup')

    await placeOnTrip(id, added.place.id, deps)
    await placeOffTrip(id, added.place.id, deps)

    expect(placeStore.size).toBe(1)
    expect((await tripViews(deps))[0]?.places).toHaveLength(0)
  })

  it('survives a place deleted out from under it', async () => {
    const { deps, atlas, placeStore } = harness()
    const trip = await addTrip(DATED, deps)
    const added = await addPlace({ name: 'A bar', categoryId: 'food' as never }, atlas)
    const id = trip.trip?.id
    if (id === undefined || added.place === undefined) throw new Error('setup')
    await placeOnTrip(id, added.place.id, deps)

    // The id is left dangling on purpose: a trip is a view of places, and
    // rewriting every trip on every delete is a lot of writing to avoid one
    // filter.
    placeStore.delete(added.place.id)

    const [view] = await tripViews(deps)
    expect(view?.places).toHaveLength(0)
  })

  it('deleting a trip keeps its places', async () => {
    const { deps, atlas, placeStore } = harness()
    const trip = await addTrip(DATED, deps)
    const added = await addPlace({ name: 'A bar', categoryId: 'food' as never }, atlas)
    const id = trip.trip?.id
    if (id === undefined || added.place === undefined) throw new Error('setup')
    await placeOnTrip(id, added.place.id, deps)

    await removeTrip(id, deps)

    expect(placeStore.size).toBe(1)
  })
})

describe('the order trips come back in', () => {
  it('puts what is happening now first and what is over last', async () => {
    const { deps } = harness()
    await addTrip({ ...DATED, name: 'Over', startDate: '2026-01-01', endDate: '2026-01-05' }, deps)
    await addTrip({ ...DATED, name: 'Later', startDate: '2026-12-01' }, deps)
    await addTrip({ ...DATED, name: 'Now', startDate: '2026-08-25', endDate: '2026-08-30' }, deps)
    await addTrip({ ...DATED, name: 'Someday' }, deps)

    const names = (await tripViews(deps)).map((view) => view.trip.name)

    // Undated sits with the upcoming rather than at the bottom: a trip with
    // no dates yet is being planned, not finished.
    expect(names).toEqual(['Now', 'Later', 'Someday', 'Over'])
  })
})

describe('refusals', () => {
  it('refuses an end date before the start', async () => {
    const { deps } = harness()

    const result = await addTrip({ ...DATED, startDate: '2026-09-10', endDate: '2026-09-01' }, deps)

    expect(result.error).toMatch(/on or after/)
  })

  it('refuses a trip with no name', async () => {
    const { deps } = harness()

    expect((await addTrip({ name: '  ', location: 'Somewhere' }, deps)).error).toMatch(/required/i)
  })

  it('says so when the trip is gone', async () => {
    const { deps } = harness()

    const result = await placeOnTrip('missing' as TripId, 'p' as never, deps)

    expect(result.error).toMatch(/no longer exists/)
  })
})
