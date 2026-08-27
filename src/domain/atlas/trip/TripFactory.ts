import type { PlaceId } from '../place/PlaceId'
import type { ValidationError } from '../shared/DomainError'
import { err, ok, type Result } from '../shared/Result'
import type { Trip } from './Trip'
import type { TripId } from './TripId'

export interface CreateTripInput {
  readonly id: TripId
  readonly name: string
  readonly location: string
  /** `YYYY-MM-DD`. A trip runs over days, not instants. */
  readonly startDate?: string
  readonly endDate?: string
  readonly notes?: string
}

export interface UpdateTripInput {
  readonly name?: string
  readonly location?: string
  /** `YYYY-MM-DD`. A trip runs over days, not instants. */
  readonly startDate?: string
  readonly endDate?: string
  readonly notes?: string
}

function validate(
  name: string,
  startDate: string | undefined,
  endDate: string | undefined,
): ValidationError[] {
  const errors: ValidationError[] = []
  if (name.length === 0) {
    errors.push({ field: 'name', message: 'Name is required.' })
  }
  // Day keys compare lexically, which is the point of storing them as
  //  rather than as dates.
  if (startDate !== undefined && endDate !== undefined && endDate < startDate) {
    errors.push({
      field: 'endDate',
      message: 'End date must be on or after the start date.',
    })
  }
  return errors
}

export function createTrip(input: CreateTripInput): Result<Trip, ValidationError[]> {
  const name = input.name.trim()
  const errors = validate(name, input.startDate, input.endDate)
  if (errors.length > 0) {
    return err(errors)
  }

  return ok({
    id: input.id,
    name,
    location: input.location.trim(),
    ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
    ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    placeIds: [],
  })
}

export function updateTrip(trip: Trip, changes: UpdateTripInput): Result<Trip, ValidationError[]> {
  const name = changes.name !== undefined ? changes.name.trim() : trip.name
  const startDate = changes.startDate ?? trip.startDate
  const endDate = changes.endDate ?? trip.endDate
  const errors = validate(name, startDate, endDate)
  if (errors.length > 0) {
    return err(errors)
  }

  return ok({
    ...trip,
    name,
    location: changes.location !== undefined ? changes.location.trim() : trip.location,
    ...(startDate === undefined ? {} : { startDate }),
    ...(endDate === undefined ? {} : { endDate }),
    ...((changes.notes ?? trip.notes) === undefined ? {} : { notes: changes.notes ?? trip.notes }),
  })
}

export function addPlaceToTrip(trip: Trip, placeId: PlaceId): Trip {
  if (trip.placeIds.includes(placeId)) {
    return trip
  }
  return { ...trip, placeIds: [...trip.placeIds, placeId] }
}

export function removePlaceFromTrip(trip: Trip, placeId: PlaceId): Trip {
  return {
    ...trip,
    placeIds: trip.placeIds.filter((id) => id !== placeId),
  }
}
