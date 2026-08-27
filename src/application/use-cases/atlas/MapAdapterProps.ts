import type { CategoryId } from '@/domain/atlas/category/CategoryDefinition'
import type { BoundingBox } from '@/domain/atlas/exploration/GeoCell'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'

export interface MapMarker {
  readonly id: string
  readonly coordinates: Coordinates
  readonly categoryId: CategoryId
  readonly label: string
  readonly icon: string
  /**
   * Somewhere you have already been. Adapters draw these differently — the
   * point of a map full of waypoints is telling at a glance which ones are
   * still worth walking to.
   */
  readonly visited: boolean
  readonly favorite: boolean
}

/** Where the device thinks it is, and how sure it is about that. */
export interface MapUserPosition {
  readonly coordinates: Coordinates
  readonly accuracyMeters: number
}

/**
 * Every map provider adapter (Leaflet today; Mapbox/Google later) implements
 * this prop contract. Pages depend only on this shape, never on a specific
 * map library, so swapping providers touches infrastructure/map only.
 *
 * `center` is authoritative: an adapter re-centres whenever it *changes*, and
 * leaves the map alone otherwise. That single rule gives follow mode for
 * free — a page follows by feeding in each new position, and stops following
 * by simply not changing `center`, which leaves the user free to pan.
 */
export interface MapAdapterProps {
  readonly center: Coordinates
  readonly zoom: number
  readonly markers: readonly MapMarker[]
  readonly onMarkerClick: (id: string) => void
  readonly onMapClick?: (coordinates: Coordinates) => void
  readonly userPosition?: MapUserPosition
  /**
   * Rectangles of the world that have been explored. When present, the adapter
   * shades everything else — so an empty array means "all fog", and omitting
   * the prop entirely means "no fog layer at all".
   */
  readonly exploredBounds?: readonly BoundingBox[]
}
