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

/**
 * The three parts of a day, in the order they happen.
 *
 * The order of this array is the order things sort in, which is why it
 * is a list rather than a set of booleans.
 */
export const PARTS_OF_DAY = ['morning', 'afternoon', 'evening'] as const
export type PartOfDay = (typeof PARTS_OF_DAY)[number]

export const PART_OF_DAY_LABELS: Record<PartOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

/**
 * Which part of the day it is now.
 *
 * The boundaries are stated here rather than guessed at each call site,
 * and they are ordinary rather than clever: noon and five o'clock are
 * where most people would put them. Nothing depends on being right about
 * the edges — this only decides which label is highlighted, never
 * whether something counts as done.
 */
export function partOfDayAt(now: Date): PartOfDay {
  const hour = now.getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

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
  /**
   * When it was completed. Unsorted is fine.
   *
   * Two shapes live here and both are read through `timesDoneOn`, which
   * compares only the first ten characters.
   *
   * A once-a-day habit stores a bare day key, `2026-08-27`, and that
   * **idempotency is load-bearing**: two devices ticking the same Tuesday
   * write the same string, the union collapses it, and `daysKept` — which
   * counts entries — pays fifteen XP once rather than twice.
   *
   * A habit done several times a day stores a full timestamp per
   * completion instead, because there is nothing to collapse: feeding the
   * dog at eight and again at six are two separate things that happened,
   * and a set of days cannot hold that. Each is one completion and pays
   * once, which is the existing rule rather than a new one.
   */
  readonly done: readonly string[]
  /**
   * How many times a day it is expected, on the days it is expected at
   * all. Absent means once, which is what every record written before
   * this meant.
   *
   * On the daily rather than inside `Cadence` because the two are
   * orthogonal: the cadence answers *which days*, this answers *how many
   * on one of them*, and folding it in would mean saying it three times.
   *
   * **Ignored entirely when `partsOfDay` names any**, and read through
   * `timesPerDay()` rather than directly for that reason. Naming morning
   * and evening *is* saying twice a day, so a second field stating a
   * count is a field that can disagree with the first — the trap this
   * codebase keeps recording, most recently over the fatigue allowance,
   * where two numbers would have left no sentence to say.
   */
  readonly timesPerDay?: number
  /**
   * Which parts of the day it belongs to. Absent or empty means no
   * particular one.
   *
   * **Coarse on purpose, because nothing can ring.** A PWA on iOS cannot
   * schedule a notification and this app has no server to push one, so a
   * stored "07:00" would be precision with no consumer — it could order
   * a list and nothing else, which three named parts do just as well and
   * without inviting somebody to expect an alarm.
   *
   * What it is for is reading a day as a routine: opening the house
   * belongs at one end and closing it at the other, and a flat
   * alphabetical list says nothing about which comes first.
   *
   * **A list, because the reported case was brushing your teeth.**
   * *"Some stuff, like brushing my teeth, is done twice a day, but I'd
   * like it morning and evening — that doesn't seem to be supported
   * right now since it's one row."* It was `timesPerDay: 2` and a single
   * part, which says the right number and nothing about when, and drew
   * one row that could not be in two places.
   *
   * Naming parts therefore does two things at once: it decides where the
   * habit is drawn *and* how many times it is expected, one row per
   * part. `partsOf` is the accessor; nothing should read this field.
   */
  readonly partsOfDay?: readonly PartOfDay[]
  /**
   * The single-part shape every record was written in before the list.
   *
   * Read through `partsOf`, never directly. A derivation rather than a
   * migration, the rule `shelfOf` follows: nothing is rewritten on read
   * and a row normalises the next time anything saves it. It stays
   * readable so a device still on the old build goes on reading its own
   * copy the way it always did.
   */
  readonly partOfDay?: PartOfDay
  /**
   * What kind of thing this is — supplements, pet care, the teeth.
   *
   * **A label, not a home.** `belongsTo` decides which screen owns the
   * record *and* which area pays its XP, so a new one costs a registry
   * area, an act, a line in `tallyActs` and a screen. This costs a
   * string, and it is what was actually wanted: the homes were already
   * right, and the list inside one of them had simply got long enough
   * that everything in it looked the same.
   *
   * Free text rather than a fixed set, because the categories are the
   * person's rather than the app's — one household has a dog and a
   * sourdough starter and another has neither. Matched case-insensitively
   * on the trimmed value, the same rule an employer name follows on the
   * resume, so "Pet care" and "pet care" are one group and nobody has to
   * notice.
   */
  readonly group?: string
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

/**
 * Whether the daily is expected on a given day.
 *
 * A retired daily is expected on nothing — that is what retiring means,
 * and it is why the streak of a retired habit stops growing rather than
 * breaking.
 */
export function isExpectedOn(daily: Daily, day: string): boolean {
  if (daily.retiredAt !== undefined && daily.retiredAt <= day) return false

  return cadenceCovers(daily.cadence, day)
}

/**
 * Whether a cadence covers a day, with no record attached.
 *
 * Split out of `isExpectedOn` so the backlog can ask the same question
 * of a reading goal. A cadence answers **from the date alone** — that is
 * the property every kind here is chosen for, and it is what makes this
 * reusable rather than something that had to be reimplemented for a
 * second kind of record. A second implementation of "is this expected
 * today" is a bug with a delay on it.
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
 * The parts of the day a habit names, in the order the day happens.
 *
 * The one reader of both shapes. `partsOfDay` wins where it holds
 * anything; a record written before the list falls back to its single
 * `partOfDay`; a habit that names none returns empty, which is what most
 * do.
 *
 * Deduplicated and re-sorted rather than trusted, because this arrives
 * from another device and from a backup file. Naming morning twice would
 * otherwise mean "twice in the morning" by the `timesPerDay` rule below
 * and draw two identical rows in one band.
 */
export function partsOf(daily: Daily): readonly PartOfDay[] {
  const named = daily.partsOfDay ?? (daily.partOfDay === undefined ? [] : [daily.partOfDay])

  return PARTS_OF_DAY.filter((part) => named.includes(part))
}

/**
 * How many times it is expected on a day it is expected at all.
 *
 * **The parts win when there are any**, and that is the whole of the
 * relationship between the two fields: "morning and evening" is a
 * statement that it happens twice, so asking for a count as well would
 * be asking the same question twice and accepting two answers.
 */
export function timesPerDay(daily: Daily): number {
  const parts = partsOf(daily)
  if (parts.length > 0) return parts.length

  return Math.max(1, Math.round(daily.timesPerDay ?? 1))
}

/**
 * One appearance of a habit in a day: the record, and which part of the
 * day this is.
 *
 * A habit naming no part has exactly one, with `part` absent — so every
 * screen works in occurrences and none of them needs a branch for the
 * ordinary case. A habit naming morning and evening has two, which is
 * what makes it two rows in two bands rather than one row saying "0 of
 * 2" in whichever band it happened to be filed under.
 */
export interface DailyOccurrence {
  readonly daily: Daily
  /** Absent when the habit names no part of the day. */
  readonly part?: PartOfDay
}

/** Every habit's appearances, flattened, in the order given. */
export function occurrencesOf(dailies: readonly Daily[]): readonly DailyOccurrence[] {
  return dailies.flatMap((daily) => {
    const parts = partsOf(daily)

    return parts.length === 0 ? [{ daily }] : parts.map((part) => ({ daily, part }))
  })
}

/**
 * One completion of a named part, written so its first ten characters
 * are still the day.
 *
 * `2026-09-01#morning`. That prefix is the contract `timesDoneOn` reads,
 * exactly as it is for the bare key and the timestamp, so a parted habit
 * needs no special case in the counting.
 *
 * **Idempotent per part, which is the reason for the shape.** Two
 * devices ticking the morning write the same string and `unionDone`
 * folds them — the property a once-a-day habit's bare day key has and a
 * multi-times habit's timestamp deliberately does not. Here it is
 * available and correct: the morning brushing is one event however many
 * devices saw it, where the dog's second feed genuinely is not the
 * first.
 */
function partEntry(day: string, part: PartOfDay): string {
  return `${day}#${part}`
}

/** Whether a named part of a day has been ticked. */
export function isPartDoneOn(daily: Daily, day: string, part: PartOfDay): boolean {
  return daily.done.includes(partEntry(day, part))
}

/** Records the completion of one named part. Idempotent. */
export function completePart(daily: Daily, day: string, part: PartOfDay): Daily {
  if (isPartDoneOn(daily, day, part)) return daily

  return { ...daily, done: [...daily.done, partEntry(day, part)].sort() }
}

/** Takes one named part back. Identity when it was not ticked. */
export function uncompletePart(daily: Daily, day: string, part: PartOfDay): Daily {
  const entry = partEntry(day, part)
  const at = daily.done.lastIndexOf(entry)
  if (at === -1) return daily

  /*
   * One entry, not every match. Two identical strings can only come from
   * a merge, and dropping both would take away a completion that did
   * happen — the rule `uncomplete` already follows.
   */
  return { ...daily, done: [...daily.done.slice(0, at), ...daily.done.slice(at + 1)] }
}

/** The parts of a day still outstanding, in the order the day happens. */
function outstandingParts(daily: Daily, day: string): readonly PartOfDay[] {
  return partsOf(daily).filter((part) => !isPartDoneOn(daily, day, part))
}

/**
 * How many completions a day carries.
 *
 * Compares the day part only, so it reads a bare day key and a full
 * timestamp the same way — which is what lets records written before
 * this keep working untouched.
 */
export function timesDoneOn(daily: Daily, day: string): number {
  return daily.done.filter((entry) => entry.slice(0, 10) === day).length
}

/** Done means done *enough times*, which is once unless stated otherwise. */
export function isDoneOn(daily: Daily, day: string): boolean {
  return timesDoneOn(daily, day) >= timesPerDay(daily)
}

/**
 * Records a completion.
 *
 * Once-a-day habits stay **idempotent**: the same day key, so ticking
 * Tuesday twice on two devices converges rather than disagreeing about
 * how many Tuesdays there were — and, because `daysKept` counts entries,
 * rather than paying for it twice.
 *
 * A habit done several times a day cannot work that way and should not:
 * the second feed is not a duplicate of the first. It appends a
 * timestamp, so two devices that each fed the dog union to two, which is
 * what happened. `at` is passed in rather than read, like every other
 * clock in the domain.
 */
export function complete(daily: Daily, day: string, at?: Date): Daily {
  /*
   * A habit that names parts fills its **earliest outstanding** one.
   *
   * Every screen that draws a row knows which part it is drawing and
   * calls `completePart`; this branch is for the callers that genuinely
   * do not have one — the history strip, where a press means "that day
   * had one more" and nothing on a fortnight of nine-pixel squares can
   * say which half of the day it was.
   *
   * Earliest rather than latest because the strip is used to repair a
   * day that was forgotten, and a day with one of two done is far more
   * often the morning kept and the evening missed than the reverse.
   * Pressing twice fills both, which is what the count already asked of
   * a multi-times habit.
   */
  const outstanding = outstandingParts(daily, day)
  if (partsOf(daily).length > 0) {
    const next = outstanding[0]

    return next === undefined ? daily : completePart(daily, day, next)
  }

  if (timesPerDay(daily) === 1) {
    if (daily.done.includes(day)) return daily
    return { ...daily, done: [...daily.done, day].sort() }
  }

  // Already at the day's quota — a fourth feed is not recorded against a
  // habit that asked for three.
  if (timesDoneOn(daily, day) >= timesPerDay(daily)) return daily

  return { ...daily, done: [...daily.done, stampFor(day, at)].sort() }
}

/**
 * Takes one completion back.
 *
 * The inverse, separately named so no flag chooses between them. For a
 * habit done several times a day it removes the **latest** entry on that
 * day rather than all of them: an undo, not an eraser, the same shape as
 * `undoLastCharge`.
 */
/**
 * One completion, written so that its first ten characters are the day
 * it happened on.
 *
 * **That prefix is the whole contract**, because `timesDoneOn` counts by
 * comparing it against a day key and nothing ever parses these back into
 * a date. It was `at.toISOString()`, which is a *UTC* date — and day
 * keys are local, from `getFullYear`/`getMonth`/`getDate`. West of
 * Greenwich those two disagree for the last hours of every evening, so a
 * habit fed at eight at night was filed under tomorrow and counted
 * towards nothing: the third of three feeds stuck at 2 of 3 while the
 * write succeeded and the XP was paid.
 *
 * The suite could not see it. Tests run in UTC, where the local date and
 * the UTC date are the same ten characters, so every assertion about
 * this passed while the app was wrong for half the day for anyone in the
 * Americas. `daily-timezone.test.ts` sets a timezone for that reason.
 *
 * The time after the prefix is local too, and carries no `Z`, because a
 * `Z` would be a claim about an offset this string does not have. Its
 * only job is to keep two completions on one day distinct — and to be
 * identical on two devices that saw the same tap, so `unionDone` folds
 * them rather than double-counting.
 *
 * **Nothing rewrites entries already stored.** An evening completion
 * filed under tomorrow's UTC date is wrong by a day and there is no way
 * to tell by how much: the offset it was written at is not recorded, and
 * guessing the current one would corrupt anything logged while
 * travelling. They are left alone, and they read as a completion on the
 * following day — which is what the record actually says.
 */
function stampFor(day: string, at: Date | undefined): string {
  if (at === undefined) return `${day}T00:00:00.000`

  const pad = (value: number, width = 2): string => value.toString().padStart(width, '0')

  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`

  return `${day}T${time}.${pad(at.getMilliseconds(), 3)}`
}

export function uncomplete(daily: Daily, day: string): Daily {
  /*
   * A parted habit takes back its **latest** part, which cannot be found
   * by sorting the strings: `#afternoon` sorts before `#evening` sorts
   * before `#morning`, so the alphabet would undo the morning first and
   * report the evening as still kept. The order of the day is the only
   * thing that answers this, and `partsOf` already holds it.
   */
  const parts = partsOf(daily)
  if (parts.length > 0) {
    const done = parts.filter((part) => isPartDoneOn(daily, day, part))
    const last = done[done.length - 1]

    return last === undefined ? daily : uncompletePart(daily, day, last)
  }

  const onDay = daily.done.filter((entry) => entry.slice(0, 10) === day)
  if (onDay.length === 0) return daily

  const latest = [...onDay].sort()[onDay.length - 1]

  /*
   * Removes one entry, not every match. Two identical strings can only
   * exist if a merge produced them, and dropping both would take away a
   * completion that did happen.
   */
  if (latest === undefined) return daily

  const at = daily.done.lastIndexOf(latest)

  return { ...daily, done: [...daily.done.slice(0, at), ...daily.done.slice(at + 1)] }
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

/**
 * The longest run ever, for the one number a streak cannot show.
 *
 * **Asks `isDoneOn` rather than `done.includes`, and that was a bug.**
 * The membership test only ever matched a bare day key, which is the
 * shape a *once-a-day* habit stores — so a habit done several times a
 * day, whose entries are timestamps, reported a best streak of **0**
 * however long it had been kept. Parted habits would have joined it,
 * their entries being `<day>#<part>`. `isDoneOn` is the predicate that
 * already knows all three shapes, and a second implementation of "was
 * this day done" is a bug with a delay on it.
 */
export function bestStreakFor(daily: Daily): number {
  if (daily.done.length === 0) return 0

  // The day part only, so a timestamp or a parted entry bounds the walk
  // by its day rather than by the string that happens to sort last.
  const days = [...daily.done].map((entry) => entry.slice(0, 10)).sort()
  const latest = days[days.length - 1]
  if (latest === undefined) return 0

  let best = 0
  let run = 0
  let cursor = days[0] ?? latest

  while (cursor <= latest) {
    if (isExpectedOn(daily, cursor)) {
      if (isDoneOn(daily, cursor)) {
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

/**
 * Whether an unknown value is a usable cadence.
 *
 * A trust-boundary guard rather than a type assertion. A cadence arrives
 * from a backup file, from another device, or from a hand-edited blob,
 * and `cadenceCovers` reads `days.includes(...)` — so a record whose
 * `days` is a string rather than an array does not degrade, it throws,
 * on a screen somebody opened to read a book.
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
