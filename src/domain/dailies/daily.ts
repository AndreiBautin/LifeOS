import type { DailyId } from '@/domain/ids/ids'
import type { RecordHome } from '@/domain/base/base'

/**
 * A thing you mean to do repeatedly, and whether you did it.
 *
 * The reminders app this replaces could ring; this cannot, because a PWA
 * has no way to schedule a notification on iOS. So a daily here earns its
 * place a different way: it is somewhere the streak is visible the moment
 * you open the app, and the streak is the only pressure in the design.
 *
 * **Completions are a set of day keys, not a counter.** The same reason
 * XP is a tally of acts rather than a running total: two devices both
 * incrementing a count cannot be reconciled, and a restore double-counts.
 * A set of days merges by union and is idempotent — ticking the same day
 * twice on two devices is one completion, which is also just true.
 */

export const CADENCE_KINDS = ['every-day', 'days-of-week', 'days-of-month'] as const

export type CadenceKind = (typeof CADENCE_KINDS)[number]

/**
 * When a daily is expected.
 *
 * Three kinds, and all three answer the question the same way: **given a
 * date, was this expected on it?** That is what makes a streak
 * computable by walking backwards a day at a time, and it is why the
 * fourth obvious kind is missing.
 *
 * "Every N days" needs an anchor to be meaningful, and an anchor drifts
 * every time you miss one — an every-three-days habit quietly becomes
 * every-three-days-from-the-last-time-you-managed-it, which is a
 * different habit and a worse one to be scored on. "Once a month,
 * whenever" has the same shape of problem from the other end: every day
 * is expected until you do it and none after, so the answer depends on
 * the completions rather than on the date, and a streak stops being a
 * walk backwards.
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
   * lower is the answer for a chore that must happen every month.
   */
  | { readonly kind: 'days-of-month'; readonly days: readonly number[] }

export interface Daily {
  readonly id: DailyId
  readonly title: string
  readonly cadence: Cadence
  /** Day keys (`YYYY-MM-DD`) it was completed on. Unsorted is fine. */
  readonly done: readonly string[]
  readonly createdAt: string
  /**
   * Retired rather than deleted, so the days it was done on survive.
   * A retired daily is expected on no day and scores no streak.
   */
  readonly retiredAt?: string
  /**
   * Set when this belongs to Base rather than to its own area.
   *
   * Absent means the natural home, which is right for every record
   * written before Base existed and for anything added without thinking
   * about it. Read it through `isBase` / `isOwnArea` in
   * `domain/base/base.ts` rather than comparing here — the two halves are
   * named so a screen listing this type has to choose a side, and the
   * failure is silent in one direction: forget to exclude Base and the
   * record shows up in two places at once.
   */
  readonly belongsTo?: RecordHome

  /** Written by the repository, never here. */
  readonly updatedAt?: string
}

const MS_PER_DAY = 86_400_000

function parseDay(key: string): Date {
  return new Date(`${key}T00:00:00Z`)
}

function keyOf(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** The day key `days` before `key`. */
export function shiftDay(key: string, days: number): string {
  return keyOf(new Date(parseDay(key).getTime() + days * MS_PER_DAY))
}

/**
 * Whether the daily is expected on a given day.
 *
 * A retired daily is expected on nothing — that is what retiring means,
 * and it is why the streak of a retired habit stops growing rather than
 * breaking.
 */
export function isExpectedOn(daily: Daily, day: string): boolean {
  if (daily.retiredAt !== undefined && daily.retiredAt <= day) return false
  if (daily.cadence.kind === 'every-day') return true

  // `getUTC*` rather than the local getters: the key was built from a
  // local date and parsed back as UTC midnight, so UTC is what
  // round-trips it.
  const date = parseDay(day)

  return daily.cadence.kind === 'days-of-week'
    ? daily.cadence.days.includes(date.getUTCDay())
    : daily.cadence.days.includes(date.getUTCDate())
}

export function isDoneOn(daily: Daily, day: string): boolean {
  return daily.done.includes(day)
}

/**
 * Ticks a day, idempotently.
 *
 * Returns the same object when the day is already ticked, so a caller can
 * skip the write — and so two devices that both ticked Tuesday converge
 * rather than disagreeing about how many Tuesdays there were.
 */
export function complete(daily: Daily, day: string): Daily {
  if (daily.done.includes(day)) return daily
  return { ...daily, done: [...daily.done, day].sort() }
}

/** Unticks a day. The inverse, and separately named so no flag chooses. */
export function uncomplete(daily: Daily, day: string): Daily {
  if (!daily.done.includes(day)) return daily
  return { ...daily, done: daily.done.filter((one) => one !== day) }
}

/**
 * How many expected days in a row, counting back from today.
 *
 * Two rules make this humane rather than punishing, and both are the
 * reason this is a function with tests rather than a `length`:
 *
 * **A day the habit was not expected on does not break it.** A weekday
 * habit is not broken by Sunday. Without this, every cadence except
 * every-day would read as a streak of one forever.
 *
 * **Today does not break it until the day is over.** Opening the app on
 * Tuesday morning to be told a twelve-day streak is over — because you
 * have not yet done the thing you are about to do — is the single most
 * discouraging thing a habit tracker can do, and it is the one it does
 * most often. An unticked today is skipped; an unticked yesterday is not.
 */
export function streakFor(daily: Daily, today: string): number {
  let streak = 0
  let cursor = today

  // A year is far past the point where a streak means anything, and it
  // bounds the walk on a record with a corrupt date.
  for (let step = 0; step < 366; step += 1) {
    if (isExpectedOn(daily, cursor)) {
      if (isDoneOn(daily, cursor)) {
        streak += 1
      } else if (cursor !== today) {
        return streak
      }
      // An unticked *today* falls through: the day is not over.
    }
    cursor = shiftDay(cursor, -1)
  }

  return streak
}

/** The longest run ever, for the one number a streak cannot show. */
export function bestStreakFor(daily: Daily): number {
  if (daily.done.length === 0) return 0

  const days = [...daily.done].sort()
  const latest = days[days.length - 1]
  if (latest === undefined) return 0

  let best = 0
  let run = 0
  let cursor = days[0] ?? latest

  while (cursor <= latest) {
    if (isExpectedOn(daily, cursor)) {
      if (daily.done.includes(cursor)) {
        run += 1
        best = Math.max(best, run)
      } else {
        run = 0
      }
    }
    cursor = shiftDay(cursor, 1)
  }

  return best
}

/** Expected today and not yet ticked. */
export function isDueToday(daily: Daily, today: string): boolean {
  return isExpectedOn(daily, today) && !isDoneOn(daily, today)
}
