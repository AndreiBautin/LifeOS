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
