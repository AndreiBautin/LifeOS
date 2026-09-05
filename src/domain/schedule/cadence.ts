import { parseDay } from '@/domain/time/day'

/**
 * When something recurs, as a property of the date alone.
 *
 * **This outlived the habits it was written for.** `domain/dailies` was
 * deleted when the recurring-task tracking moved to a calendar, and the
 * Codex's reading goals still carry one of these — so the type and the
 * one function that reads it came here rather than going with the rest.
 *
 * `cadenceCovers` is the single place "is this expected today" is
 * answered. A second implementation of that is a bug with a delay on it,
 * which is why it was split out of the habits in the first place.
 */

export const CADENCE_KINDS = ['every-day', 'days-of-week', 'days-of-month'] as const

export type CadenceKind = (typeof CADENCE_KINDS)[number]

/**
 * Three kinds, and all three answer the question the same way: **given a
 * date, was this expected on it?** That is what makes a streak
 * computable by walking backwards a day at a time, and it is why the
 * fourth obvious kind is missing.
 *
 * "Every N days" needs an anchor to be meaningful, and an anchor drifts
 * every time you miss one — an every-three-days goal quietly becomes
 * every-three-days-from-the-last-time-you-managed-it, which is a
 * different goal and a worse one to be scored on. "Once a month,
 * whenever" has the same shape of problem from the other end: every day
 * is expected until you do it and none after, so the answer depends on
 * the progress rather than on the date, and a streak stops being a walk
 * backwards.
 *
 * `days-of-month` is monthly without either flaw. The 1st is monthly;
 * the 1st and the 15th is twice a month. It is a property of the date
 * alone, exactly like `days-of-week`.
 */
export type Cadence =
  | { readonly kind: 'every-day' }
  /** `0` is Sunday, matching `Date.getDay()`. */
  | { readonly kind: 'days-of-week'; readonly days: readonly number[] }
  /**
   * `1` to `31`. A day past the end of a short month simply does not
   * occur that month — the 31st is expected seven times a year, and
   * February skips it rather than sliding it to the 28th.
   *
   * Sliding is the tempting alternative and it breaks the same property
   * every other cadence keeps: "was this expected on the 28th" would
   * depend on which month the 28th was in, and a streak walk would have
   * to know about month lengths to stay correct. Choosing the 28th or
   * lower is the answer for something that must happen every month.
   */
  | { readonly kind: 'days-of-month'; readonly days: readonly number[] }

/**
 * Whether a cadence covers a day key.
 *
 * The one place this is answered, so every caller agrees about which
 * days count.
 */
export function cadenceCovers(cadence: Cadence, day: string): boolean {
  if (cadence.kind === 'every-day') return true

  // `getUTC*` rather than the local getters: the key was built from a
  // local date and parsed back as UTC midnight, so UTC is what
  // round-trips it.
  const date = parseDay(day)

  return cadence.kind === 'days-of-week'
    ? cadence.days.includes(date.getUTCDay())
    : cadence.days.includes(date.getUTCDate())
}

/**
 * Whether an unknown value is a cadence, checked at the trust boundary.
 *
 * It arrives from a backup or another device, and `cadenceCovers` reads
 * `days.includes` — so a `days` that is a string does not degrade, it
 * throws, on a screen somebody opened to read a book.
 *
 * The day numbers are checked for range as well as type, because
 * `days-of-month: [0]` is expected on no day of any month and reads as a
 * goal that is simply never due, with nothing on any screen saying why.
 */
export function isPlausibleCadence(value: unknown): value is Cadence {
  if (typeof value !== 'object' || value === null) return false

  const bag = value as { kind?: unknown; days?: unknown }
  if (bag.kind === 'every-day') return true

  if (!Array.isArray(bag.days)) return false
  if (!bag.days.every((day) => typeof day === 'number' && Number.isInteger(day))) return false

  // `0` is Sunday, matching `Date.getDay()`; days of the month are 1-31.
  if (bag.kind === 'days-of-week') return bag.days.every((day: number) => day >= 0 && day <= 6)
  if (bag.kind === 'days-of-month') return bag.days.every((day: number) => day >= 1 && day <= 31)

  return false
}
