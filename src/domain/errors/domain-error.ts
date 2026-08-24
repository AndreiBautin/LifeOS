/**
 * A rule in the domain was violated.
 *
 * These are thrown for states the domain considers impossible — a
 * percentage outside 0–500, a rep range whose low exceeds its high — not
 * for ordinary user mistakes. User-facing validation returns a result the
 * UI can render; a DomainError means a caller constructed something the
 * model does not permit, and the boundary turns it into a report rather
 * than a silent wrong number.
 */
export class DomainError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export function invariant(condition: boolean, code: string, message: string): asserts condition {
  if (!condition) throw new DomainError(message, code)
}
