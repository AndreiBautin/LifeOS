import type { Brand } from '../shared/Brand'
import { err, ok, type Result } from '../shared/Result'
import type { ValidationError } from '../shared/DomainError'

export type TripId = Brand<string, 'TripId'>

export function createTripId(raw: string): Result<TripId, ValidationError> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return err({ field: 'id', message: 'Trip id must not be empty.' })
  }
  return ok(trimmed as TripId)
}
