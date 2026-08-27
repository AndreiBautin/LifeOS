import type { CategoryId } from '@/domain/atlas/category/CategoryDefinition'
import type { Place } from '@/domain/atlas/place/Place'
import { isResolved } from '@/domain/atlas/place/Place'
import type { Tag } from '@/domain/atlas/place/Tag'
import type { Priority } from '@/domain/atlas/status-priority/Priority'
import type { Status } from '@/domain/atlas/status-priority/Status'

export interface PlaceFilterCriteria {
  readonly categoryIds?: readonly CategoryId[]
  readonly statuses?: readonly Status[]
  readonly priorities?: readonly Priority[]
  readonly city?: string
  readonly state?: string
  readonly country?: string
  readonly tags?: readonly Tag[]
  readonly favoriteOnly?: boolean
  /** `true` keeps only places still missing coordinates; `false` only resolved ones. */
  readonly resolved?: boolean
  readonly searchText?: string
}

function matchesText(value: string | undefined, expected: string): boolean {
  return (value ?? '').trim().toLowerCase() === expected.trim().toLowerCase()
}

function matches(place: Place, criteria: PlaceFilterCriteria): boolean {
  if (criteria.categoryIds && !criteria.categoryIds.includes(place.categoryId)) {
    return false
  }
  if (criteria.statuses && !criteria.statuses.includes(place.status)) {
    return false
  }
  if (criteria.priorities && !criteria.priorities.includes(place.priority)) {
    return false
  }
  if (criteria.city !== undefined && !matchesText(place.location.city, criteria.city)) {
    return false
  }
  if (criteria.state !== undefined && !matchesText(place.location.state, criteria.state)) {
    return false
  }
  if (criteria.country !== undefined && !matchesText(place.location.country, criteria.country)) {
    return false
  }
  if (criteria.tags && !criteria.tags.every((tag) => place.tags.includes(tag))) {
    return false
  }
  if (criteria.favoriteOnly && !place.favorite) {
    return false
  }
  if (criteria.resolved !== undefined && isResolved(place) !== criteria.resolved) {
    return false
  }
  if (
    criteria.searchText &&
    !place.name.toLowerCase().includes(criteria.searchText.toLowerCase())
  ) {
    return false
  }
  return true
}

export function filterPlaces(places: readonly Place[], criteria: PlaceFilterCriteria): Place[] {
  return places.filter((place) => matches(place, criteria))
}
