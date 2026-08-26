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

/**
 * Both halves padded, so the string sorts the way the position orders.
 *
 * Only the nanoseconds were, and the comment claimed the whole cursor
 * sorted correctly — which it did not: `"10.000000000"` is less than
 * `"9.000000000"` as text, so a cursor nine seconds into the epoch
 * compared as *later* than one ten seconds in. Nothing reads it as text
 * today, which is exactly why it went unnoticed, and exactly the kind of
 * thing a later change relies on by accident.
 *
 * Twelve digits covers seconds past the year 33,000. Wide enough that the
 * question does not come up, narrow enough to read.
 */
export const CURSOR_SECONDS_DIGITS = 12

export function encodeCursor(position: CursorPosition): string {
  const seconds = String(position.seconds).padStart(CURSOR_SECONDS_DIGITS, '0')
  return `${seconds}.${String(position.nanoseconds).padStart(9, '0')}`
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

  /*
   * Digits only, checked before `Number` sees the string.
   *
   * `Number` is far more generous than a cursor format has any business
   * being: it read `"1.5e3"` as 1500, `" 7 "` as 7, `"1e2"` as 100 and
   * `"0b11"` as 3 — all of them integers, all of them passing the checks
   * below, none of them a position this app ever wrote. The guard against
   * `"1.2.3"` was already here for exactly that reason and simply did not
   * go far enough.
   */
  if (!isDigits(secondsText)) return CURSOR_START
  if (nanosecondsText !== undefined && !isDigits(nanosecondsText)) return CURSOR_START

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

/** Non-empty, digits only, and short enough not to overflow a safe integer. */
function isDigits(value: string | undefined): value is string {
  return value !== undefined && value.length > 0 && value.length <= 15 && /^\d+$/.test(value)
}
