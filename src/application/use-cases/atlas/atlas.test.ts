import { describe, expect, it } from 'vitest'

import { toCellId, type CellId } from '@/domain/atlas/exploration/GeoCell'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import type { Place } from '@/domain/atlas/place/Place'
import type { Clock, ExploredAreaRepository, PlaceRepository } from '@/domain/repositories/ports'

import {
  addPlace,
  addSharedLocation,
  atlasView,
  bulkAddPlaces,
  recordPosition,
  visitPlace,
  type AtlasDeps,
} from './atlas'

/**
 * The atlas from the application's side.
 *
 * Two things here are worth more than the rest: the accuracy gate, because
 * clearing fog is irreversible, and the fact that a visited place's ground
 * is *derived* rather than stored.
 */
function harness(at = new Date('2026-08-27T09:00:00.000Z')) {
  const store = new Map<string, Place>()
  const walked = new Set<CellId>()
  let sequence = 0

  const clock: Clock = { now: () => at }

  const places: PlaceRepository = {
    all: () => Promise.resolve([...store.values()]),
    byId: (id) => Promise.resolve(store.get(id as string)),
    save: (place) => {
      store.set(place.id, { ...place, updatedAt: clock.now().toISOString() })
      return Promise.resolve()
    },
    restoreMany: () => Promise.resolve(),
    remove: (id) => {
      store.delete(id)
      return Promise.resolve()
    },
    purge: () => Promise.resolve(),
    count: () => Promise.resolve(store.size),
  }

  const explored: ExploredAreaRepository = {
    all: () => Promise.resolve(new Set(walked)),
    reveal: (cells) => {
      const before = walked.size
      for (const cell of cells) walked.add(cell)
      return Promise.resolve(walked.size - before)
    },
    clear: () => {
      walked.clear()
      return Promise.resolve()
    },
    count: () => Promise.resolve(walked.size),
  }

  const deps: AtlasDeps = {
    places,
    explored,
    clock,
    ids: {
      next: () => {
        sequence += 1
        return `place-${sequence.toString()}`
      },
    },
  }

  return { deps, walked, store }
}

const LONDON: Coordinates = { latitude: 51.5074, longitude: -0.1278 }

describe('recordPosition', () => {
  /*
   * The gate that matters most in this whole feature. A fix accurate to
   * half a kilometre says nothing about which 150-metre square you are
   * standing in, and fog cleared by a bad reading cannot be put back —
   * there is no such thing as un-walking ground, which is the same reason
   * the sync has no tombstone for a cell.
   */
  it('refuses a reading too vague to place you in a square', async () => {
    const { deps, walked } = harness()

    expect(await recordPosition(LONDON, 800, deps)).toBe(0)
    expect(walked.size).toBe(0)
  })

  it('accepts a reading accurate enough to trust', async () => {
    const { deps, walked } = harness()

    expect(await recordPosition(LONDON, 12, deps)).toBe(1)
    expect(walked.has(toCellId(LONDON))).toBe(true)
  })

  it('reports nothing new for a square already cleared', async () => {
    const { deps } = harness()
    await recordPosition(LONDON, 12, deps)

    // The common case on a walk: a reading every second or two, almost all
    // of them landing where you already are. Zero means no write and no
    // re-render.
    expect(await recordPosition(LONDON, 12, deps)).toBe(0)
  })

  it('clears a new square once you have moved into one', async () => {
    const { deps, walked } = harness()
    await recordPosition(LONDON, 12, deps)

    const along = { latitude: LONDON.latitude + 0.004, longitude: LONDON.longitude }
    await recordPosition(along, 12, deps)

    expect(walked.size).toBe(2)
  })
})

describe('the atlas view', () => {
  /*
   * A visited place's ground is derived from the place, never stored
   * beside it — so un-visiting or editing a place stays correct with no
   * second copy of the truth to drift.
   */
  it('reveals the ground under a visited place without storing it', async () => {
    const { deps, walked } = harness()

    const added = await addPlace(
      { name: 'The pub', categoryId: 'food' as never, latitude: 51.52, longitude: -0.1 },
      deps,
    )
    const place = added.place
    if (place === undefined) throw new Error(added.error)
    await visitPlace(place.id, deps)

    const view = await atlasView(deps)

    expect(view.cellCount).toBe(1)
    // Derived, so nothing was written to the walked set.
    expect(walked.size).toBe(0)
  })

  it('counts a square once when it was both walked and visited', async () => {
    const { deps } = harness()

    await recordPosition(LONDON, 12, deps)
    const added = await addPlace(
      {
        name: 'Right here',
        categoryId: 'food' as never,
        latitude: LONDON.latitude,
        longitude: LONDON.longitude,
      },
      deps,
    )
    const place = added.place
    if (place === undefined) throw new Error(added.error)
    await visitPlace(place.id, deps)

    expect((await atlasView(deps)).cellCount).toBe(1)
  })

  it('is empty ground before anything has happened', async () => {
    const { deps } = harness()

    expect(await atlasView(deps)).toMatchObject({ cellCount: 0, areaKm2: 0 })
  })
})

describe('adding a place', () => {
  it('refuses a half-supplied point rather than dropping half of it', async () => {
    const { deps } = harness()

    const result = await addPlace(
      { name: 'Somewhere', categoryId: 'food' as never, latitude: 51.5 },
      deps,
    )

    expect(result.error).toMatch(/both latitude and longitude/)
  })

  it('accepts a name with no point at all', async () => {
    const { deps } = harness()

    const result = await addPlace(
      { name: 'That bar Sam mentioned', categoryId: 'food' as never },
      deps,
    )

    expect(result.place?.location.coordinates).toBeUndefined()
  })

  it('refuses a category nothing knows about', async () => {
    const { deps } = harness()

    const result = await addPlace({ name: 'Somewhere', categoryId: 'nonsense' as never }, deps)

    expect(result.error).toMatch(/category/i)
  })
})

describe('a pasted list of places', () => {
  /*
   * The mind-dump path: twelve restaurants from a message, saved without a
   * coordinate each. What matters is that nothing goes missing quietly —
   * the parse reports what it dropped, and this carries that back out.
   */
  it('saves every usable line and says what it skipped', async () => {
    const { deps } = harness()
    await addPlace({ name: 'Kiln', categoryId: 'food' as never }, deps)

    const result = await bulkAddPlaces(
      ['1. Kiln', '- Brat', '', 'Smoking Goat', 'Brat'].join('\n'),
      'food' as never,
      deps,
    )

    expect(result.added).toBe(2)
    expect(result.skipped.alreadySaved).toEqual(['Kiln'])
    expect(result.skipped.duplicates).toEqual(['Brat'])
  })

  it('saves them without a point rather than refusing them', async () => {
    const { deps, store } = harness()

    await bulkAddPlaces('That bar Sam mentioned', 'food' as never, deps)

    const saved = [...store.values()][0]
    expect(saved?.location.coordinates).toBeUndefined()
  })
})

describe('a location shared in from a maps app', () => {
  it('saves the name and the point out of a Google share', async () => {
    const { deps } = harness()

    const result = await addSharedLocation(
      {
        text: 'https://www.google.com/maps/place/Kiln/@51.5129,-0.1345,17z/data=!3d51.5129!4d-0.1345',
        categoryId: 'food' as never,
      },
      deps,
    )

    expect(result.place?.name).toBe('Kiln')
    expect(result.place?.location.coordinates).toMatchObject({ latitude: 51.5129 })
  })

  /*
   * The awkward one. A short link's target only exists behind a redirect a
   * browser cannot follow cross-origin, so there is no point to save — but
   * Android puts the name above the link, and a named place with no point
   * is a place this app is happy to hold.
   */
  it('still saves the name when the link cannot be resolved', async () => {
    const { deps } = harness()

    const result = await addSharedLocation(
      { text: 'Smoking Goat\nhttps://maps.app.goo.gl/abc123', categoryId: 'food' as never },
      deps,
    )

    expect(result.shared.needsRedirect).toBe(true)
    expect(result.place?.name).toBe('Smoking Goat')
    expect(result.place?.location.coordinates).toBeUndefined()
  })

  it('takes a typed name for a share that is only a point', async () => {
    const { deps } = harness()

    // A `geo:` URI is coordinates and nothing else. Refusing it outright
    // would throw away the one thing the share did carry.
    const result = await addSharedLocation(
      { text: 'geo:51.5074,-0.1278', categoryId: 'food' as never, name: 'The bench' },
      deps,
    )

    expect(result.place?.name).toBe('The bench')
    expect(result.place?.location.coordinates).toMatchObject({ latitude: 51.5074 })
  })

  it('refuses a share with nothing nameable in it', async () => {
    const { deps } = harness()

    const result = await addSharedLocation({ text: '   ', categoryId: 'food' as never }, deps)

    expect(result.error).toMatch(/Nothing in that share/)
  })
})

describe('a share for somewhere already on the list', () => {
  /*
   * The workflow the paste and the share make between them: twelve names
   * pasted out of a message, and weeks later the link for one of them
   * shared from a maps app. A second "Kiln" beside the first is the wrong
   * answer — the share is the missing half of a place already saved.
   */
  it('places the one that was waiting rather than adding another', async () => {
    const { deps, store } = harness()
    await bulkAddPlaces('Kiln\nBrat', 'food' as never, deps)

    const result = await addSharedLocation(
      { text: 'kiln\ngeo:51.5129,-0.1345', categoryId: 'food' as never, name: 'kiln' },
      deps,
    )

    expect(store.size).toBe(2)
    expect(result.place?.location.coordinates).toMatchObject({ latitude: 51.5129 })
  })

  it('adds a second one when the first already has a point', async () => {
    const { deps, store } = harness()
    await addPlace(
      { name: 'Kiln', categoryId: 'food' as never, latitude: 51.5, longitude: -0.1 },
      deps,
    )

    // Two branches of the same chain is a thing that exists, so a place
    // that is already placed is left alone.
    await addSharedLocation(
      { text: 'Kiln\ngeo:51.6,-0.2', categoryId: 'food' as never, name: 'Kiln' },
      deps,
    )

    expect(store.size).toBe(2)
  })

  it('leaves a nameless share alone when there is nothing to match', async () => {
    const { deps, store } = harness()

    await addSharedLocation(
      { text: 'geo:51.5,-0.1', categoryId: 'food' as never, name: 'Somewhere new' },
      deps,
    )

    expect(store.size).toBe(1)
  })
})
