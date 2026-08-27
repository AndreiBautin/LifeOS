import type { CategoryId, CategoryRegistry } from '../category/CategoryDefinition'
import type { ValidationError } from '../shared/DomainError'
import { err, ok, type Result } from '../shared/Result'
import type { Priority } from '../status-priority/Priority'
import type { Status } from '../status-priority/Status'
import type { Coordinates } from './Coordinates'
import { createCoordinates } from './Coordinates'
import type { Place } from './Place'
import type { PlaceId } from './PlaceId'
import { normalizeTags } from './Tag'

const MAX_NAME_LENGTH = 200

export interface CreatePlaceInput {
  readonly id: PlaceId
  readonly name: string
  readonly categoryId: CategoryId
  readonly latitude?: number
  readonly longitude?: number
  readonly status?: Status
  readonly priority?: Priority
  readonly address?: string
  readonly city?: string
  readonly state?: string
  readonly country?: string
  readonly website?: string
  readonly phone?: string
  readonly notes?: string
  readonly tags?: readonly string[]
  readonly favorite?: boolean
}

export interface UpdatePlaceInput {
  readonly name?: string
  readonly categoryId?: CategoryId
  readonly status?: Status
  readonly priority?: Priority
  readonly latitude?: number
  readonly longitude?: number
  /**
   * Omitting latitude/longitude means "leave the location alone", so removing
   * one needs its own explicit signal rather than an absent field.
   */
  readonly clearCoordinates?: boolean
  readonly address?: string
  readonly city?: string
  readonly state?: string
  readonly country?: string
  readonly website?: string
  readonly phone?: string
  readonly notes?: string
  readonly tags?: readonly string[]
  readonly favorite?: boolean
}

function validateName(name: string, errors: ValidationError[]): void {
  if (name.length === 0) {
    errors.push({ field: 'name', message: 'Name is required.' })
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.push({
      field: 'name',
      message: `Name must be ${String(MAX_NAME_LENGTH)} characters or fewer.`,
    })
  }
}

/**
 * Latitude and longitude travel together: supplying neither leaves the place
 * unresolved (a name-only capture), supplying both validates into
 * `Coordinates`, and supplying exactly one is a user error worth reporting
 * rather than silently dropping half a point.
 */
function resolveCoordinates(
  latitude: number | undefined,
  longitude: number | undefined,
  errors: ValidationError[],
): Coordinates | undefined {
  if (latitude === undefined && longitude === undefined) {
    return undefined
  }
  if (latitude === undefined || longitude === undefined) {
    errors.push({
      field: latitude === undefined ? 'latitude' : 'longitude',
      message: 'Provide both latitude and longitude, or neither.',
    })
    return undefined
  }

  const result = createCoordinates(latitude, longitude)
  if (!result.ok) {
    errors.push({ field: 'coordinates', message: result.error.message })
    return undefined
  }
  return result.value
}

export function createPlace(
  input: CreatePlaceInput,
  registry: CategoryRegistry,
  now: Date,
): Result<Place, ValidationError[]> {
  const errors: ValidationError[] = []

  const name = input.name.trim()
  validateName(name, errors)

  if (!registry.has(input.categoryId)) {
    errors.push({ field: 'categoryId', message: 'Unknown category.' })
  }

  const coordinates = resolveCoordinates(input.latitude, input.longitude, errors)

  if (errors.length > 0) {
    return err(errors)
  }

  /*
   * Optional fields are spread in when present rather than assigned
   * `undefined`, and that is not a style preference — Lift compiles with
   * `exactOptionalPropertyTypes`, where an absent key and a key holding
   * `undefined` are different types. Map did not, which is the compiler
   * half of the gate parity step: the verification command was the visible
   * gap and this was the one underneath it.
   *
   * It matters beyond the compiler. IndexedDB stores the difference, so a
   * place with `website: undefined` written explicitly comes back carrying
   * a key that reads as present until something looks closely.
   */
  return ok({
    id: input.id,
    name,
    categoryId: input.categoryId,
    status: input.status ?? 'saved',
    priority: input.priority ?? 'medium',
    location: {
      ...(input.address === undefined ? {} : { address: input.address }),
      ...(input.city === undefined ? {} : { city: input.city }),
      ...(input.state === undefined ? {} : { state: input.state }),
      ...(input.country === undefined ? {} : { country: input.country }),
      ...(coordinates === undefined ? {} : { coordinates }),
    },
    ...(input.website === undefined ? {} : { website: input.website }),
    ...(input.phone === undefined ? {} : { phone: input.phone }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    tags: normalizeTags(input.tags ?? []),
    favorite: input.favorite ?? false,
    dateAdded: now.toISOString(),
  })
}

export function updatePlace(
  place: Place,
  changes: UpdatePlaceInput,
  registry: CategoryRegistry,
): Result<Place, ValidationError[]> {
  const errors: ValidationError[] = []

  const name = changes.name !== undefined ? changes.name.trim() : place.name
  validateName(name, errors)

  const categoryId = changes.categoryId ?? place.categoryId
  if (!registry.has(categoryId)) {
    errors.push({ field: 'categoryId', message: 'Unknown category.' })
  }

  const existing = place.location.coordinates
  let coordinates: Coordinates | undefined
  if (changes.clearCoordinates === true) {
    coordinates = undefined
  } else if (changes.latitude === undefined && changes.longitude === undefined) {
    coordinates = existing
  } else {
    coordinates = resolveCoordinates(
      changes.latitude ?? existing?.latitude,
      changes.longitude ?? existing?.longitude,
      errors,
    )
  }

  if (errors.length > 0) {
    return err(errors)
  }

  const optional = <T>(key: string, value: T | undefined) =>
    value === undefined ? {} : { [key]: value }

  return ok({
    ...place,
    name,
    categoryId,
    status: changes.status ?? place.status,
    priority: changes.priority ?? place.priority,
    location: {
      ...optional('address', changes.address ?? place.location.address),
      ...optional('city', changes.city ?? place.location.city),
      ...optional('state', changes.state ?? place.location.state),
      ...optional('country', changes.country ?? place.location.country),
      ...optional('coordinates', coordinates),
    },
    ...optional('website', changes.website ?? place.website),
    ...optional('phone', changes.phone ?? place.phone),
    ...optional('notes', changes.notes ?? place.notes),
    tags: changes.tags !== undefined ? normalizeTags(changes.tags) : place.tags,
    favorite: changes.favorite ?? place.favorite,
  })
}

export function markVisited(place: Place, visitedAt: Date): Place {
  return { ...place, status: 'visited', dateVisited: visitedAt.toISOString() }
}

export function toggleFavorite(place: Place): Place {
  return { ...place, favorite: !place.favorite }
}
