import { err, ok, type Result } from '../shared/Result'
import type { ValidationError } from '../shared/DomainError'

export interface Coordinates {
  readonly latitude: number
  readonly longitude: number
}

export function createCoordinates(
  latitude: number,
  longitude: number,
): Result<Coordinates, ValidationError> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return err({
      field: 'latitude',
      message: 'Latitude must be a number between -90 and 90.',
    })
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return err({
      field: 'longitude',
      message: 'Longitude must be a number between -180 and 180.',
    })
  }
  return ok({ latitude, longitude })
}

const EARTH_RADIUS_KM = 6371

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Great-circle distance between two points, in kilometers (haversine formula). */
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const centralAngle = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return EARTH_RADIUS_KM * centralAngle
}
