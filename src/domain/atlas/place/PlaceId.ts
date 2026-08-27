import type { Brand } from '../shared/Brand'
import { err, ok, type Result } from '../shared/Result'
import type { ValidationError } from '../shared/DomainError'

export type PlaceId = Brand<string, 'PlaceId'>

export function createPlaceId(raw: string): Result<PlaceId, ValidationError> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return err({ field: 'id', message: 'Place id must not be empty.' })
  }
  return ok(trimmed as PlaceId)
}
