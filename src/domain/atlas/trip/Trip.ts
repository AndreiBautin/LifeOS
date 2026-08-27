import type { PlaceId } from '../place/PlaceId'
import type { TripId } from './TripId'

export interface Trip {
  readonly id: TripId
  readonly name: string
  readonly location: string
  /** `YYYY-MM-DD`. A trip runs over days, not instants. */
  readonly startDate?: string
  readonly endDate?: string
  readonly notes?: string
  readonly placeIds: readonly PlaceId[]
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
