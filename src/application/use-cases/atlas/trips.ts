import { toDayKey } from '@/domain/time/day'
import type { Place } from '@/domain/atlas/place/Place'
import { isResolved } from '@/domain/atlas/place/Place'
import type { PlaceId } from '@/domain/atlas/place/PlaceId'
import type { Trip } from '@/domain/atlas/trip/Trip'
import {
  addPlaceToTrip,
  createTrip,
  removePlaceFromTrip,
  updateTrip,
  type CreateTripInput,
  type UpdateTripInput,
} from '@/domain/atlas/trip/TripFactory'
import { createTripId } from '@/domain/atlas/trip/TripId'
import type { TripId } from '@/domain/atlas/trip/TripId'
import type { IdGenerator } from '@/domain/ids/ids'
import type { Clock, PlaceRepository, TripRepository } from '@/domain/repositories/ports'

/**
 * Trips: a handful of places and the days you will be near them.
 *
 * The thin one of the atlas's three parts, deliberately. A trip owns no
 * facts of its own beyond a name, a place and some dates — everything it
 * shows comes from the places it points at, which is why removing a place
 * from a trip leaves the place alone and why deleting a trip cannot lose
 * anything.
 *
 * Dates are `YYYY-MM-DD` strings and compare lexically. A trip runs over
 * days rather than instants, and a timestamp would make "is it on today?"
 * depend on a timezone nobody chose.
 */

export interface TripDeps {
  readonly trips: TripRepository
  readonly places: PlaceRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

export type TripResult =
  | { readonly trip: Trip; readonly error?: undefined }
  | { readonly trip?: undefined; readonly error: string }

function firstMessage(errors: readonly { readonly message: string }[]): string {
  return errors[0]?.message ?? 'That could not be saved.'
}

export async function addTrip(
  input: Omit<CreateTripInput, 'id'>,
  deps: TripDeps,
): Promise<TripResult> {
  const id = createTripId(deps.ids.next())
  if (!id.ok) return { error: id.error.message }

  const created = createTrip({ ...input, id: id.value })
  if (!created.ok) return { error: firstMessage(created.error) }

  await deps.trips.save(created.value)
  return { trip: created.value }
}

export async function editTrip(
  id: TripId,
  changes: UpdateTripInput,
  deps: TripDeps,
): Promise<TripResult> {
  const existing = await deps.trips.byId(id)
  if (existing === undefined) return { error: 'That trip no longer exists.' }

  const updated = updateTrip(existing, changes)
  if (!updated.ok) return { error: firstMessage(updated.error) }

  await deps.trips.save(updated.value)
  return { trip: updated.value }
}

export async function removeTrip(id: TripId, deps: TripDeps): Promise<void> {
  await deps.trips.remove(id)
}

/**
 * Puts a place on a trip, or takes it off again.
 *
 * Two names rather than one function with a flag, and neither touches the
 * place itself: a trip holds ids, so taking somewhere off an itinerary can
 * never be the thing that deletes it.
 */
export async function placeOnTrip(
  id: TripId,
  placeId: PlaceId,
  deps: TripDeps,
): Promise<TripResult> {
  const existing = await deps.trips.byId(id)
  if (existing === undefined) return { error: 'That trip no longer exists.' }

  const next = addPlaceToTrip(existing, placeId)
  await deps.trips.save(next)
  return { trip: next }
}

export async function placeOffTrip(
  id: TripId,
  placeId: PlaceId,
  deps: TripDeps,
): Promise<TripResult> {
  const existing = await deps.trips.byId(id)
  if (existing === undefined) return { error: 'That trip no longer exists.' }

  const next = removePlaceFromTrip(existing, placeId)
  await deps.trips.save(next)
  return { trip: next }
}

export interface TripView {
  readonly trip: Trip
  /** In the order the trip lists them, with anything deleted dropped. */
  readonly places: readonly Place[]
  readonly visited: number
  /** How many of its places still have no point on the map. */
  readonly unplaced: number
  /** Compared as day keys, so "today" means the whole day. */
  readonly status: 'past' | 'current' | 'upcoming' | 'undated'
}

/**
 * A trip's dates against a day, as `past`, `current` or `upcoming`.
 *
 * Both bounds are inclusive: a trip that ends today is still on today. An
 * exclusive end would file somebody's last morning under "past", which is
 * the kind of small wrongness that makes an app feel like it is arguing
 * with you.
 */
export function tripStatus(trip: Trip, today: string): TripView['status'] {
  if (trip.startDate === undefined && trip.endDate === undefined) return 'undated'

  const start = trip.startDate ?? trip.endDate
  const end = trip.endDate ?? trip.startDate
  if (start === undefined || end === undefined) return 'undated'

  if (today < start) return 'upcoming'
  if (today > end) return 'past'
  return 'current'
}

/**
 * The soonest first, and the ones already over last.
 *
 * Undated trips sit with the upcoming ones rather than at the bottom: a
 * trip with no dates yet is something being planned, not something that
 * has been and gone.
 */
const ORDER: Record<TripView['status'], number> = {
  current: 0,
  upcoming: 1,
  undated: 2,
  past: 3,
}

export async function tripViews(deps: TripDeps): Promise<readonly TripView[]> {
  const [trips, places] = await Promise.all([deps.trips.all(), deps.places.all()])
  const byId = new Map(places.map((place) => [place.id, place]))
  // `toDayKey`, not the UTC date. A trip is upcoming or past according
  // to the day the traveller is in, and the two disagree for the last
  // hours of every evening west of Greenwich.
  const today = toDayKey(deps.clock.now())

  return trips
    .map((trip) => {
      // A place deleted out from under a trip leaves an id pointing at
      // nothing. Dropped here rather than repaired on delete, because a
      // trip is a view of places and a dangling id costs nothing.
      const kept = trip.placeIds
        .map((placeId) => byId.get(placeId))
        .filter((place): place is Place => place !== undefined)

      return {
        trip,
        places: kept,
        visited: kept.filter((place) => place.status === 'visited').length,
        unplaced: kept.filter((place) => !isResolved(place)).length,
        status: tripStatus(trip, today),
      }
    })
    .sort((a, b) => {
      const byStatus = ORDER[a.status] - ORDER[b.status]
      if (byStatus !== 0) return byStatus
      return (a.trip.startDate ?? '9999').localeCompare(b.trip.startDate ?? '9999')
    })
}
