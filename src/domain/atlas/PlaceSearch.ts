import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import type { Result } from '@/domain/atlas/shared/Result'

/**
 * One candidate returned by a geocoding/place-search backend. Deliberately
 * provider-neutral: Nominatim today, Google Places or Mapbox later, all
 * flattened to the same shape so the screen never learns which one is
 * wired up. Everything except the name and point is optional — real-world
 * search results are patchy, and a missing city is not an error.
 *
 * The optional fields accept an explicit `undefined`, which the stored
 * records deliberately do not. Nothing here reaches IndexedDB: a result is
 * shown in a list, and the one the person picks is turned into a place. The
 * distinction between an absent key and one holding `undefined` has
 * nowhere to survive to.
 */
export interface PlaceSearchResult {
  readonly providerId: string
  readonly providerPlaceId: string
  readonly name: string
  /** The provider's full human-readable label, for disambiguating in a list. */
  readonly displayName: string
  readonly address?: string | undefined
  readonly city?: string | undefined
  readonly state?: string | undefined
  readonly country?: string | undefined
  readonly coordinates: Coordinates
  /**
   * Raw provider classification tokens (e.g. OSM's `['amenity', 'cafe']`),
   * left untranslated here so category mapping stays a config concern.
   */
  readonly categoryHints: readonly string[]
  readonly website?: string | undefined
  readonly phone?: string | undefined
}

export interface PlaceSearchQuery {
  readonly text: string
  /** Biases results towards a point — usually wherever the user currently is. */
  readonly near?: Coordinates | undefined
  readonly limit?: number | undefined
  readonly signal?: AbortSignal | undefined
}

export type PlaceSearchErrorCode = 'network' | 'rate-limited' | 'provider-error' | 'aborted'

export interface PlaceSearchError {
  readonly code: PlaceSearchErrorCode
  readonly message: string
}

export interface PlaceSearchProvider {
  readonly id: string
  search(query: PlaceSearchQuery): Promise<Result<readonly PlaceSearchResult[], PlaceSearchError>>
}
