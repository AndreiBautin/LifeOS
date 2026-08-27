import { describe, expect, it } from 'vitest'
import type { CategoryId } from '../category/CategoryDefinition'
import type { Place } from './Place'
import { isResolved, resolvedPlaces, unresolvedPlaces } from './Place'
import type { PlaceId } from './PlaceId'

const now = new Date('2026-01-01T00:00:00.000Z')

function place(id: string, coordinates?: { latitude: number; longitude: number }): Place {
  return {
    id: id as PlaceId,
    name: id,
    categoryId: 'coffee' as CategoryId,
    status: 'saved',
    priority: 'medium',
    location: coordinates === undefined ? {} : { coordinates },
    tags: [],
    favorite: false,
    dateAdded: now.toISOString(),
  }
}

const resolved = place('resolved', { latitude: 1, longitude: 2 })
const unresolved = place('unresolved')

describe('isResolved', () => {
  it('is true only when the place has coordinates', () => {
    expect(isResolved(resolved)).toBe(true)
    expect(isResolved(unresolved)).toBe(false)
  })

  it('narrows the type so coordinates can be read without a check', () => {
    if (isResolved(resolved)) {
      expect(resolved.location.coordinates.latitude).toBe(1)
    }
  })
})

describe('resolvedPlaces / unresolvedPlaces', () => {
  it('partitions a list', () => {
    const all = [resolved, unresolved]

    expect(resolvedPlaces(all)).toEqual([resolved])
    expect(unresolvedPlaces(all)).toEqual([unresolved])
  })
})
