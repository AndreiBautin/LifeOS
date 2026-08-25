/**
 * The cursor a sync target hands back, encoded as text.
 *
 * The port declares the cursor opaque to everything above it, but *some*
 * implementation has to encode it, and the encoding is where a subtle,
 * silent bug lives: a cursor too coarse to distinguish two records
 * written moments apart will read one of them, advance past both, and
 * lose the other permanently. Nothing errors, nothing warns, and the set
 * you logged on Tuesday is simply not there.
 *
 * So the cursor keeps full precision. Firestore's server timestamps carry
 * seconds and nanoseconds; a cursor recording only milliseconds would
 * collapse a million distinguishable instants into one, and the exchange
 * uses a strict `>` comparison, which is exactly the case where a
 * collapsed tie drops a record.
 *
 * Pure and here rather than beside the Firestore code because this is the
 * part worth testing, and testing it should not require a database.
 */

export interface CursorPosition {
  readonly seconds: number
  readonly nanoseconds: number
}

export const CURSOR_START: CursorPosition = { seconds: 0, nanoseconds: 0 }

export function encodeCursor(position: CursorPosition): string {
  // Nanoseconds padded so the string sorts the same way the number does.
  // Not required by anything today — the value is parsed, not compared as
  // text — but a cursor that sorts wrongly is the kind of thing someone
  // later relies on by accident.
  return `${String(position.seconds)}.${String(position.nanoseconds).padStart(9, '0')}`
}

/**
 * Reads a cursor, degrading to the beginning rather than throwing.
 *
 * The stored value is untrusted: written by an older version, hand
 * edited, or truncated by a storage quota. Every failure mode resolves to
 * "start over", which is slow exactly once and always correct — the
 * alternative, guessing at a position, risks skipping records that will
 * never be offered again.
 */
export function decodeCursor(value: string | undefined): CursorPosition {
  if (value === undefined) return CURSOR_START

  const parts = value.split('.')
  // Exactly one or two parts. Reading "1.2.3" as 1.2 and discarding the
  // rest accepts a cursor nothing ever wrote, which means accepting a
  // position nothing ever reached.
  if (parts.length > 2) return CURSOR_START

  const [secondsText, nanosecondsText] = parts
  if (secondsText === undefined || secondsText === '') return CURSOR_START
  if (nanosecondsText !== undefined && nanosecondsText === '') return CURSOR_START

  const seconds = Number(secondsText)
  const nanoseconds = nanosecondsText === undefined ? 0 : Number(nanosecondsText)

  if (!Number.isInteger(seconds) || seconds < 0) return CURSOR_START
  if (!Number.isInteger(nanoseconds) || nanoseconds < 0 || nanoseconds > 999_999_999) {
    return CURSOR_START
  }

  return { seconds, nanoseconds }
}

/** Later of the two, so a cursor only ever moves forward. */
export function laterCursor(a: CursorPosition, b: CursorPosition): CursorPosition {
  if (a.seconds !== b.seconds) return a.seconds > b.seconds ? a : b
  return a.nanoseconds >= b.nanoseconds ? a : b
}
