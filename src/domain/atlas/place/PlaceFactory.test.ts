import { describe, expect, it } from 'vitest'
import { createCategoryRegistry } from '../category/CategoryDefinition'
import type { CategoryDefinition, CategoryId } from '../category/CategoryDefinition'
import { isErr, isOk } from '../shared/Result'
import { isResolved } from './Place'
import { createPlace, markVisited, toggleFavorite, updatePlace } from './PlaceFactory'
import type { CreatePlaceInput } from './PlaceFactory'
import { createPlaceId } from './PlaceId'

const restaurants: CategoryDefinition = {
  id: 'restaurants' as CategoryId,
  label: 'Restaurants',
  icon: '🍔',
}
const registry = createCategoryRegistry([restaurants])

const placeIdResult = createPlaceId('place-1')
if (!placeIdResult.ok) throw new Error('unreachable: fixture id is valid')
const placeId = placeIdResult.value

const now = new Date('2026-01-01T00:00:00.000Z')

function validInput(overrides: Partial<CreatePlaceInput> = {}): CreatePlaceInput {
  return {
    id: placeId,
    name: 'Joe’s Diner',
    categoryId: restaurants.id,
    latitude: 40.7128,
    longitude: -74.006,
    ...overrides,
  }
}

/**
 * The same fixture with no point on it.
 *
 * A separate builder rather than `validInput({ latitude: undefined })`,
 * because under `exactOptionalPropertyTypes` an explicit `undefined` is
 * not the same as an absent key — and it is the absence these cases are
 * actually about. Map compiled without that flag; Lift does not.
 */
function nameOnlyInput(overrides: Partial<CreatePlaceInput> = {}): CreatePlaceInput {
  const { latitude: _lat, longitude: _lon, ...rest } = validInput()
  return { ...rest, ...overrides }
}

describe('createPlace', () => {
  it('creates a place with sensible defaults', () => {
    const result = createPlace(validInput(), registry, now)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const place = result.value
      expect(place.id).toBe(placeId)
      expect(place.name).toBe('Joe’s Diner')
      expect(place.categoryId).toBe(restaurants.id)
      expect(place.status).toBe('saved')
      expect(place.priority).toBe('medium')
      expect(place.favorite).toBe(false)
      expect(place.tags).toEqual([])
      expect(place.location.coordinates).toEqual({
        latitude: 40.7128,
        longitude: -74.006,
      })
      expect(place.dateAdded).toEqual(now.toISOString())
      expect(place.dateVisited).toBeUndefined()
    }
  })

  it('trims the name', () => {
    const result = createPlace(validInput({ name: '  Joe’s Diner  ' }), registry, now)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.name).toBe('Joe’s Diner')
    }
  })

  it('accepts optional status, priority, location, and tags', () => {
    const result = createPlace(
      validInput({
        status: 'wantToVisit',
        priority: 'high',
        city: 'New York',
        state: 'NY',
        country: 'USA',
        tags: ['Cozy', 'cozy', 'Brunch'],
        favorite: true,
      }),
      registry,
      now,
    )

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const place = result.value
      expect(place.status).toBe('wantToVisit')
      expect(place.priority).toBe('high')
      expect(place.location.city).toBe('New York')
      expect(place.tags).toEqual(['cozy', 'brunch'])
      expect(place.favorite).toBe(true)
    }
  })

  it('rejects an empty name', () => {
    const result = createPlace(validInput({ name: '   ' }), registry, now)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.some((e) => e.field === 'name')).toBe(true)
    }
  })

  it('rejects an unknown category', () => {
    const result = createPlace(validInput({ categoryId: 'unknown' as CategoryId }), registry, now)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.some((e) => e.field === 'categoryId')).toBe(true)
    }
  })

  it('rejects invalid coordinates', () => {
    const result = createPlace(validInput({ latitude: 200 }), registry, now)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.some((e) => e.field === 'coordinates')).toBe(true)
    }
  })

  it('aggregates multiple validation errors at once', () => {
    const result = createPlace(
      validInput({ name: '', categoryId: 'unknown' as CategoryId, latitude: 200 }),
      registry,
      now,
    )

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toHaveLength(3)
    }
  })
})

describe('updatePlace', () => {
  function existingPlace() {
    const result = createPlace(validInput(), registry, now)
    if (!result.ok) throw new Error('unreachable: fixture input is valid')
    return result.value
  }

  it('applies partial changes', () => {
    const result = updatePlace(existingPlace(), { notes: 'Great tacos' }, registry)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.notes).toBe('Great tacos')
      expect(result.value.name).toBe('Joe’s Diner')
      expect(result.value.dateAdded).toEqual(now.toISOString())
    }
  })

  it('rejects clearing the name to empty', () => {
    const result = updatePlace(existingPlace(), { name: '   ' }, registry)

    expect(isErr(result)).toBe(true)
  })

  it('rejects switching to an unknown category', () => {
    const result = updatePlace(existingPlace(), { categoryId: 'unknown' as CategoryId }, registry)

    expect(isErr(result)).toBe(true)
  })

  it('recomputes coordinates when both latitude and longitude change', () => {
    const result = updatePlace(existingPlace(), { latitude: 10, longitude: 20 }, registry)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.location.coordinates).toEqual({ latitude: 10, longitude: 20 })
    }
  })
})

describe('markVisited', () => {
  it('sets status to visited and records the visit date', () => {
    const result = createPlace(validInput(), registry, now)
    if (!result.ok) throw new Error('unreachable: fixture input is valid')

    const visitedAt = new Date('2026-03-01T00:00:00.000Z')
    const visited = markVisited(result.value, visitedAt)

    expect(visited.status).toBe('visited')
    expect(visited.dateVisited).toEqual(visitedAt.toISOString())
  })
})

describe('toggleFavorite', () => {
  it('flips the favorite flag', () => {
    const result = createPlace(validInput(), registry, now)
    if (!result.ok) throw new Error('unreachable: fixture input is valid')

    const toggled = toggleFavorite(result.value)

    expect(toggled.favorite).toBe(true)

    const toggledAgain = toggleFavorite(toggled)
    expect(toggledAgain.favorite).toBe(false)
  })
})

describe('createPlace without coordinates', () => {
  it('creates an unresolved place when latitude and longitude are both omitted', () => {
    const result = createPlace(nameOnlyInput(), registry, now)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.location.coordinates).toBeUndefined()
      expect(isResolved(result.value)).toBe(false)
    }
  })

  it('rejects a half-supplied point', () => {
    const result = createPlace(nameOnlyInput({ latitude: 40.7128 }), registry, now)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toEqual([
        {
          field: 'longitude',
          message: 'Provide both latitude and longitude, or neither.',
        },
      ])
    }
  })
})

describe('updatePlace coordinates', () => {
  function unresolvedPlace() {
    const created = createPlace(nameOnlyInput(), registry, now)
    if (!isOk(created)) throw new Error('unreachable: fixture is valid')
    return created.value
  }

  it('resolves an unresolved place when both coordinates arrive', () => {
    const result = updatePlace(unresolvedPlace(), { latitude: 51.5, longitude: -0.12 }, registry)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.location.coordinates).toEqual({
        latitude: 51.5,
        longitude: -0.12,
      })
      expect(isResolved(result.value)).toBe(true)
    }
  })

  it('rejects resolving an unresolved place with only one coordinate', () => {
    const result = updatePlace(unresolvedPlace(), { latitude: 51.5 }, registry)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.some((e) => e.field === 'longitude')).toBe(true)
    }
  })

  it('leaves an unresolved place unresolved when unrelated fields change', () => {
    const result = updatePlace(unresolvedPlace(), { name: 'Renamed' }, registry)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.name).toBe('Renamed')
      expect(result.value.location.coordinates).toBeUndefined()
    }
  })
})
