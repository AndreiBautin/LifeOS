import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import { distanceKm } from '@/domain/atlas/place/Coordinates'
import type { Place } from '@/domain/atlas/place/Place'
import { isResolved } from '@/domain/atlas/place/Place'
import { PRIORITY_METADATA } from '@/domain/atlas/status-priority/Priority'

export const PLACE_SORT_OPTIONS = [
  'recentlyAdded',
  'recentlyVisited',
  'alphabetical',
  'distance',
  'priority',
] as const

export type PlaceSortOption = (typeof PLACE_SORT_OPTIONS)[number]

export function sortPlaces(
  places: readonly Place[],
  sortBy: PlaceSortOption,
  origin?: Coordinates,
): Place[] {
  const copy = [...places]

  switch (sortBy) {
    case 'alphabetical':
      return copy.sort((a, b) => a.name.localeCompare(b.name))
    /*
     * Compared as strings, which is the reason the dates stopped being
     * `Date` objects on the way across. ISO 8601 sorts lexically in
     * chronological order, so this needs no parsing and — more to the
     * point — no coercion: a `Date` compared with `<` silently stringifies
     * and gives an answer that is wrong rather than an error that is
     * obvious.
     */
    case 'recentlyAdded':
      return copy.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
    case 'recentlyVisited':
      // Never visited sorts last: an empty string loses to every real
      // timestamp.
      return copy.sort((a, b) => (b.dateVisited ?? '').localeCompare(a.dateVisited ?? ''))
    case 'priority':
      return copy.sort(
        (a, b) =>
          PRIORITY_METADATA[a.priority].sortWeight - PRIORITY_METADATA[b.priority].sortWeight,
      )
    case 'distance': {
      if (!origin) {
        return copy
      }
      const originValue = origin
      // Places with no coordinates yet have no distance at all; keep them in
      // the list (they are still real saved places) but park them at the end.
      const distanceFrom = (place: Place): number =>
        isResolved(place)
          ? distanceKm(originValue, place.location.coordinates)
          : Number.POSITIVE_INFINITY
      return copy.sort((a, b) => distanceFrom(a) - distanceFrom(b))
    }
  }
}
