import type { CategoryId } from '../category/CategoryDefinition'
import type { Priority } from '../status-priority/Priority'
import type { Status } from '../status-priority/Status'
import type { Coordinates } from './Coordinates'
import type { PlaceId } from './PlaceId'
import type { Tag } from './Tag'

export interface PlaceLocation {
  readonly address?: string
  readonly city?: string
  readonly state?: string
  readonly country?: string
  /**
   * Optional on purpose: a place can be captured as a name-only "mind dump"
   * entry and resolved to a real point later (see the Inbox). Anything that
   * needs a point on a map — markers, distance sort, "Nearby" — must narrow
   * with `isResolved` first rather than assuming this is present.
   */
  readonly coordinates?: Coordinates
}

export interface Place {
  readonly id: PlaceId
  readonly name: string
  readonly categoryId: CategoryId
  readonly status: Status
  readonly priority: Priority
  readonly location: PlaceLocation
  readonly website?: string
  readonly phone?: string
  readonly notes?: string
  readonly tags: readonly Tag[]
  readonly favorite: boolean
  /** ISO 8601. Stamped by the factory from the injected clock. */
  readonly dateAdded: string
  readonly dateVisited?: string
  /**
   * Written by the repository on save, never here.
   *
   * Was `lastUpdated`, and was a `Date`. Both had to change. Lift's sync
   * primitives key on `updatedAt`, and they compare ISO strings
   * *lexically* — a `Date` survives a structured clone perfectly well and
   * then compares by coercion, which fails quietly rather than loudly.
   */
  readonly updatedAt?: string
}

/** A `Place` that is known to sit at a specific point on the map. */
export type ResolvedPlace = Place & {
  readonly location: PlaceLocation & { readonly coordinates: Coordinates }
}

export function isResolved(place: Place): place is ResolvedPlace {
  return place.location.coordinates !== undefined
}

export function resolvedPlaces(places: readonly Place[]): ResolvedPlace[] {
  return places.filter(isResolved)
}

export function unresolvedPlaces(places: readonly Place[]): Place[] {
  return places.filter((place) => !isResolved(place))
}
