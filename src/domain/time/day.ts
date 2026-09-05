/**
 * The day and month a moment falls in, as sortable keys.
 *
 * There were five copies of this before it was one — in the quest log, in
 * the circle, in the social use case, in `measure.ts`, and in the review
 * screen. All five agreed, which is the only reason nothing had broken
 * yet: they are the sort of six-line helper that gets rewritten rather
 * than imported, and the sixth author is the one who reaches for
 * `toISOString()`.
 *
 * **Local time, deliberately, and this is the whole point of the file.**
 * `toISOString()` is UTC, so west of Greenwich anything logged in the
 * evening is filed under tomorrow — a set finished at 7pm in New York
 * lands on the next day, breaking a streak that was never broken and
 * moving a hangout into a week that had not started. Every day key in this
 * app is the day the person was living in, not the day at Greenwich.
 *
 * The cost, stated: a device that changes timezone re-files nothing. A
 * workout logged in London stays on its London day when you land in
 * Tokyo, which is right — it happened on that day — even though the key
 * was computed somewhere else.
 */

/** `YYYY-MM`. */
export function toMonthKey(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${year}-${month}`
}

/** `YYYY-MM-DD`. Sorts lexically in chronological order. */
export function toDayKey(date: Date): string {
  return `${toMonthKey(date)}-${date.getDate().toString().padStart(2, '0')}`
}

/**
 * The week, Sunday-indexed to match `Date.getDay()`.
 *
 * Here rather than in a component because the *indexing* is the load-
 * bearing part — a list that started on Monday would silently shift
 * every stored `days-of-week` cadence by one — and because two screens
 * now need it. It was declared twice before this, once in the habit form
 * and once about to be in the vitals one.
 */
export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/**
 * The two halves of the week, Sunday-indexed like everything else here.
 *
 * In the domain rather than in the form, for the same reason
 * `WEEKDAY_LABELS` is: the indexing is what a stored cadence means, and
 * a list written out at a call site is a list that can be written out
 * wrongly at the next one.
 *
 * Complements by construction — every day is in exactly one — so a
 * "weekends" shortcut and a "weekdays" one cannot drift into overlapping
 * or leaving Wednesday out.
 */
export const WEEKDAYS = [1, 2, 3, 4, 5] as const
export const WEEKEND = [0, 6] as const

/** "Fri, Sat" — for reading a chosen set of days back in a sentence. */
export function namedDays(days: readonly number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  return sorted.map((day) => WEEKDAY_NAMES[day]?.slice(0, 3) ?? '?').join(', ')
}

const MS_PER_DAY = 86_400_000

/**
 * Midnight UTC for a day key.
 *
 * Exported because `cadenceCovers` needs the same reading: a key is
 * built from a local date and parsed back as UTC midnight, so the
 * `getUTC*` getters are what round-trip it.
 */
export function parseDay(key: string): Date {
  return new Date(`${key}T00:00:00Z`)
}

/**
 * The UTC date, and here that is correct rather than an oversight.
 *
 * This is half of `shiftDay`, which is calendar arithmetic on a key
 * rather than a reading of a clock: `parseDay` builds midnight *UTC*
 * from a key and this formats one back. UTC in, UTC out, so a day is
 * exactly 86,400,000 milliseconds and no offset change can make one
 * shorter. Reading it locally would be the bug — `getDate()` on a UTC
 * midnight returns the previous day anywhere west of Greenwich.
 */
function keyOf(date: Date): string {
  // eslint-disable-next-line no-restricted-syntax -- symmetric with parseDay; see above
  return date.toISOString().slice(0, 10)
}

/** The day key `days` before `key`. */
export function shiftDay(key: string, days: number): string {
  return keyOf(new Date(parseDay(key).getTime() + days * MS_PER_DAY))
}
