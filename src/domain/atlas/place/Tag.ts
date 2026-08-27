import type { Brand } from '../shared/Brand'
import { err, ok, type Result } from '../shared/Result'
import type { ValidationError } from '../shared/DomainError'

export type Tag = Brand<string, 'Tag'>

const MAX_TAG_LENGTH = 40

export function createTag(raw: string): Result<Tag, ValidationError> {
  const normalized = raw.trim().toLowerCase()
  if (normalized.length === 0) {
    return err({ field: 'tags', message: 'A tag must not be empty.' })
  }
  if (normalized.length > MAX_TAG_LENGTH) {
    return err({
      field: 'tags',
      message: `A tag must be ${String(MAX_TAG_LENGTH)} characters or fewer.`,
    })
  }
  return ok(normalized as Tag)
}

/**
 * Normalizes free-form tag input for the quick-add flow: invalid or duplicate
 * entries are silently dropped rather than blocking capture, since tags are
 * an optional, low-friction field.
 */
export function normalizeTags(raw: readonly string[]): Tag[] {
  const seen = new Set<Tag>()
  for (const value of raw) {
    const result = createTag(value)
    if (result.ok) {
      seen.add(result.value)
    }
  }
  return [...seen]
}
