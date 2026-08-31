import type { ViceId } from '@/domain/ids/ids'
import { namedDays } from '@/domain/time/day'

/**
 * Amounts you are keeping to, as a pool that refills on its own.
 *
 * The framing is the whole design. A limit stated as a rule — "no more
 * than two coffees" — has exactly two states, kept and broken, and the
 * broken one is a small failure you carry for the rest of the day. A
 * limit stated as a *resource* has as many states as it has charges: you
 * have three, you spend one, you have two, and the question stops being
 * whether you were good and becomes what you have left. Nothing here
 * blocks a spend and nothing scolds one. It counts.
 *
 * That also happens to be the honest model. You are not abstaining from
 * coffee; you are budgeting it. An app that pretended otherwise would be
 * asking to be lied to, and a log you lie to is worth nothing.
 */

export const CHARGE_PERIODS = ['day', 'week', 'month'] as const
export type ChargePeriod = (typeof CHARGE_PERIODS)[number]

export const CHARGE_PERIOD_LABELS: Record<ChargePeriod, string> = {
  day: 'a day',
  week: 'a week',
  month: 'a month',
}

/**
 * How a spent charge finds its way back.
 *
 * Two shapes, because people genuinely hold two different models and
 * forcing either into the other reads as nonsense. Coffee is a
 * **rolling** limit — two at a time, and the point of stating it in
 * hours is that midnight must not hand you a third; a daily allowance
 * invites a double espresso at eleven at night. Beer is a **calendar**
 * one: four a week, and nobody computes that as "one back every
 * forty-two hours", which is what this asked for before.
 *
 * Both are derived from the spend list and the clock and store no refill
 * time, which is the property the whole design rests on — see
 * `readCharges`. A calendar boundary is a fact about the date alone,
 * exactly like a daily's cadence, so it merges as cleanly as the rolling
 * window does.
 */
export type ChargeCycle =
  | { readonly kind: 'rolling'; readonly hours: number }
  | { readonly kind: 'calendar'; readonly period: ChargePeriod }

/**
 * Which way a pool is meant to go.
 *
 * A limit is spent down — coffee, beer, caffeine — and going past it is
 * the thing worth seeing. A target is filled up: water is not something
 * you are rationing, and reporting "1 over" for a fourth glass would be
 * scolding somebody for drinking enough.
 *
 * The arithmetic is identical and only the sentiment differs, which is
 * why this is a flag on one mechanism rather than a second one. Absent
 * means a limit — every pool written before this was one.
 */
/**
 * Which days a pool may be touched on.
 *
 * Two ways of saying it, because they are two different rules. **A
 * count** — at most two days a week, whichever two — leaves the choice
 * to the day it arrives on. **Named days** — Friday and Saturday — is a
 * decision made once, in advance, and is what somebody usually means by
 * "I only drink at weekends". A count cannot express it: any two days
 * permits Monday and Tuesday.
 *
 * `days-of-week` is spelled as it is in `Cadence`, and Sunday-indexed
 * for the same reason — `Date.getDay()` is what reads it.
 *
 * A stored limit with no `kind` is a count, which is what every one
 * written before this was.
 */
export type DaysLimit =
  | { readonly kind?: 'count'; readonly days: number; readonly period: ChargePeriod }
  | { readonly kind: 'days-of-week'; readonly days: readonly number[] }

/**
 * A day limit with its numbers made sensible.
 *
 * Beside the type rather than in the use-case, because both shapes need
 * different treatment — a count must be a whole number of at least one,
 * a set of weekdays must hold only real weekdays and no duplicates —
 * and a caller that knew to round one would have to be told about the
 * other. Named days with nothing left is `undefined`: a picker with
 * nothing chosen means undecided, not "shut every day".
 */
export function saneDaysLimit(limit: DaysLimit): DaysLimit | undefined {
  if (limit.kind === 'days-of-week') {
    const days = [...new Set(limit.days)]
      .filter((day) => day >= 0 && day <= 6)
      .sort((a, b) => a - b)
    return days.length === 0 ? undefined : { kind: 'days-of-week', days }
  }

  return { kind: 'count', days: Math.max(1, Math.round(limit.days)), period: limit.period }
}

export const CHARGE_DIRECTIONS = ['limit', 'target'] as const
export type ChargeDirection = (typeof CHARGE_DIRECTIONS)[number]

/** A quick amount to log, so a common measure is one tap. */
export interface ChargePreset {
  readonly label: string
  readonly amount: number
}

export interface Vice {
  readonly id: ViceId
  readonly name: string
  /**
   * What the pool holds in a cycle — four beers, or four hundred
   * milligrams. At least one.
   */
  readonly capacity: number
  /**
   * What one unit is, when it is not simply a count.
   *
   * `mg` for caffeine, `ml` for water. Absent means the pool counts
   * things, which is what every pool written before this did — and the
   * difference is real rather than cosmetic: a double espresso and a
   * cold brew are one coffee each and very different amounts of
   * caffeine.
   */
  readonly unit?: string
  readonly direction?: ChargeDirection
  /**
   * How many *days* the pool may be touched at all, within a period.
   *
   * The second dimension, and neither existing shape could stand in for
   * it: "four a week" permits four on one night, and "three a day"
   * permits twenty-one. Moderating drink is usually both at once — a few
   * on a couple of nights — and stating it needs two numbers because it
   * is two decisions.
   *
   * Independent of `cycle`, which governs the *amount*. The common
   * pairing is an amount per day with days per week, but an amount per
   * week on at most two days is equally sayable and works unchanged.
   */
  readonly daysLimit?: DaysLimit
  /** Offered when logging, so a glass of water is one tap and not a form. */
  readonly presets?: readonly ChargePreset[]
  /**
   * The rolling window, in hours.
   *
   * Optional now, and kept because devices already hold pools written
   * with it. **Read it through `cycleOf` rather than directly** — a pool
   * carrying `cycle` ignores this, and a reader that looked here first
   * would report a beer allowance in hours again.
   */
  readonly regenHours?: number
  /** How the pool refills. Absent on records written before it existed. */
  readonly cycle?: ChargeCycle
  /**
   * One ISO timestamp per charge spent, ever. Unsorted is fine.
   *
   * A list rather than a counter, for the reason `Daily.done` is a set of
   * day keys: two devices each incrementing a count cannot be
   * reconciled, and a restore double-counts. Timestamps merge by union
   * and the merge is idempotent.
   */
  readonly spent: readonly string[]
  readonly createdAt: string
  /** Retired rather than deleted, so what it recorded survives. */
  readonly retiredAt?: string
  readonly updatedAt?: string
}

export interface ChargeReading {
  readonly capacity: number
  /** `0` to `capacity`. */
  readonly available: number
  /** Charges spent inside the cooldown window. May exceed capacity. */
  readonly onCooldown: number
  /**
   * How far past the allowance this pool currently is, and `0` normally.
   *
   * Separate from `available` because clamping the bar at empty is right
   * and clamping the *record* at empty is not. A spend is always allowed
   * — see the note on the type above — so the fourth coffee against a
   * capacity of three has to land somewhere, and hiding it would make
   * the one day worth noticing look exactly like a day at the limit.
   */
  readonly over: number
  /** When the next charge comes back. Absent when the pool is full. */
  readonly nextBackAt?: Date
  /**
   * The day allowance, when the pool has one.
   *
   * `todayCounts` is the load-bearing part: a day already spent on does
   * not cost a second one, so a pool with both days used is still open
   * on one of those days and shut on any other. Without it a second
   * drink on a Friday you had already started would read as breaking the
   * limit.
   */
  readonly days?: {
    readonly used: number
    readonly allowed: number
    readonly todayCounts: boolean
    /**
     * Whether today is a day this pool may be touched at all.
     *
     * The single question both shapes answer, and the one `available`
     * is folded against. A count is open while days remain or the day
     * has already started; named days are open on the named days and
     * shut on the others however few have been used.
     */
    readonly openToday: boolean
  }
}

/**
 * The separator between when a charge was spent and how much it was.
 *
 * An entry is `2026-08-30T15:45:34.045Z` for one, or
 * `2026-08-30T15:45:34.045Z#95` for ninety-five of whatever the pool
 * counts. **The amount is encoded into the string rather than held
 * beside it**, and that is the whole reason this works: the merge is a
 * union over strings, so two devices logging the same drink produce the
 * same entry and it collapses, while two different drinks stay two.
 *
 * That is not a trick to be tidied into an object array later. The
 * amount is part of what happened — "95mg at 08:00" is one event — so
 * putting it in the identity is correct, and an array of objects would
 * need a merge rule written from scratch to say the same thing.
 */
const AMOUNT_SEPARATOR = '#'

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_ROLLING_HOURS = 12

/**
 * The cycle a pool runs on, however it was written.
 *
 * Records made before `cycle` existed carry `regenHours` and nothing
 * else, and they are on a device right now — so this is the one place
 * that knows both shapes, and every reader goes through it. No migration
 * writes over them: a stored `regenHours` is already a complete, correct
 * statement of a rolling window, and rewriting it would be churn that
 * risks a merge for no gain.
 */
interface Spend {
  readonly at: number
  readonly amount: number
}

/**
 * One entry, read back.
 *
 * A bare timestamp is one — which is what every entry written before
 * amounts existed is, so nothing needed migrating.
 */
function parseSpend(entry: string): Spend | undefined {
  const [stamp, size] = entry.split(AMOUNT_SEPARATOR)
  const at = Date.parse(stamp ?? '')
  if (!Number.isFinite(at)) return undefined

  if (size === undefined) return { at, amount: 1 }

  const amount = Number(size)
  // A size that will not parse is not silently worth one: it would make
  // a pool read as fuller or emptier than it is, with nothing to see.
  return Number.isFinite(amount) && amount > 0 ? { at, amount } : undefined
}

/** Writes an entry, omitting the amount when it is the default of one. */
export function spendEntry(at: Date, amount = 1): string {
  return amount === 1 ? at.toISOString() : `${at.toISOString()}${AMOUNT_SEPARATOR}${String(amount)}`
}

export function directionOf(vice: Vice): ChargeDirection {
  return vice.direction ?? 'limit'
}

export function cycleOf(vice: Vice): ChargeCycle {
  if (vice.cycle !== undefined) return vice.cycle
  return { kind: 'rolling', hours: vice.regenHours ?? DEFAULT_ROLLING_HOURS }
}

/**
 * When the calendar period containing `now` began.
 *
 * Local midnight, because a person's day is local — a pool that reset at
 * UTC midnight would refill mid-evening for a good part of the world.
 *
 * **The week starts on Monday**, and for this feature that is not a
 * stylistic choice. A weekly drink allowance has to hold Friday,
 * Saturday and Sunday together; a week starting on Sunday splits the
 * weekend across two allowances, so a Saturday beer and a Sunday beer
 * would be counted against different weeks.
 */
export function periodStart(now: Date, period: ChargePeriod): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (period === 'day') return start
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)

  // `getDay()` is Sunday-indexed; shift so Monday is the zero.
  const sinceMonday = (start.getDay() + 6) % 7
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() - sinceMonday)
}

/** When the current period ends, which is when the pool comes back. */
export function periodEnd(now: Date, period: ChargePeriod): Date {
  const start = periodStart(now, period)

  if (period === 'day') {
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
  }
  if (period === 'week') {
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
  }
  return new Date(start.getFullYear(), start.getMonth() + 1, 1)
}

/**
 * How much of a pool is available, as a function of the spends and the
 * clock — and of nothing else.
 *
 * **A charge comes back exactly `regenHours` after the spend that
 * consumed it.** Each spend is independently on its own cooldown, so
 * three coffees at eight in the morning on a twelve-hour timer are all
 * three back at eight in the evening.
 *
 * The alternative is a token bucket — a pool that refills at a steady
 * rate of one per `regenHours`, so those three would return one at a
 * time. That is what most games actually do with charge abilities, it is
 * the version somebody will propose, and it cannot be built here: a
 * bucket needs to remember when it last refilled, and a remembered
 * refill time is device state that **cannot be merged**. Spend a charge
 * on the phone and another on the laptop while the two are apart, and
 * there is no answer to which bucket level is correct.
 *
 * Deriving it from the spend list has no such state. The list unions,
 * the union is idempotent, and this function is pure — so two devices
 * that have seen the same spends agree on the reading whatever order
 * they arrived in. The mechanic was chosen to fit the merge, and that is
 * the right way round: a nicer mechanic that desynchronises is not
 * nicer.
 */
/**
 * Which distinct days inside the period have anything logged on them.
 *
 * Distinct days rather than entries: three drinks on one Friday is one
 * drinking day, which is the whole point of counting this separately
 * from the amount.
 */
function daysUsedIn(vice: Vice, now: Date, period: ChargePeriod): Set<string> {
  const from = periodStart(now, period).getTime()

  return new Set(
    vice.spent
      .map(parseSpend)
      .filter((spend): spend is Spend => spend !== undefined && spend.at >= from)
      .map((spend) => toLocalDayKey(new Date(spend.at))),
  )
}

/**
 * What a pool took on one local day, in its own units.
 *
 * Exported because two callers outside this file were doing it by hand
 * and both had the same bug: `stamp.slice(0, 10) === day` compares the
 * *UTC* date inside an entry against a day key built from the local
 * clock, and west of Greenwich those disagree for the last hours of
 * every evening. A drink at nine at night counted towards tomorrow.
 *
 * The parsing has to happen here anyway — an entry may carry an amount
 * after a `#`, so it is not a date string and `new Date` on it yields
 * Invalid Date.
 *
 * **Amounts, not entries.** The other half of what those callers had
 * wrong: one entry is one *spend*, not one unit, so counting rows makes
 * a 400 mg caffeine limit take four hundred coffees to breach.
 */
export function amountSpentOn(vice: Vice, day: string): number {
  return vice.spent
    .map(parseSpend)
    .filter(
      (spend): spend is Spend => spend !== undefined && toLocalDayKey(new Date(spend.at)) === day,
    )
    .reduce((total, spend) => total + spend.amount, 0)
}

/** `YYYY-MM-DD` in local time, which is the day a person means. */
function toLocalDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
}

export function readCharges(vice: Vice, now: Date): ChargeReading {
  const cycle = cycleOf(vice)

  /*
   * Both shapes reduce to the same question — which spends still count —
   * so only the cutoff differs and everything below is shared. A rolling
   * window asks "within the last N hours"; a calendar one asks "since
   * this period began".
   */
  const cutoff =
    cycle.kind === 'rolling'
      ? now.getTime() - cycle.hours * HOUR_MS
      : periodStart(now, cycle.period).getTime() - 1

  const active = vice.spent
    .map(parseSpend)
    .filter((spend): spend is Spend => spend !== undefined && spend.at > cutoff)
    .sort((a, b) => a.at - b.at)

  // Summed, not counted. One entry can be ninety-five milligrams.
  const onCooldown = active.reduce((total, spend) => total + spend.amount, 0)
  const available = Math.max(0, vice.capacity - onCooldown)

  /*
   * Only a limit can be exceeded. A fourth glass of water against a
   * three-glass target is not an overrun, and reporting it as one would
   * be scolding somebody for drinking enough.
   */
  const over = directionOf(vice) === 'limit' ? Math.max(0, onCooldown - vice.capacity) : 0

  /*
   * The day allowance, folded into what is available.
   *
   * Out of days and today is not one of them means nothing is available,
   * whatever the amount says — "can I have one" is answered by both
   * constraints and the stricter one wins. Spending is still never
   * refused; this only reports.
   */
  const dayLimit = vice.daysLimit
  const days =
    dayLimit === undefined
      ? undefined
      : (() => {
          if (dayLimit.kind === 'days-of-week') {
            /*
             * Counted over the week whatever the amount's own cycle is,
             * because a set of weekdays is a statement about a week.
             */
            const used = daysUsedIn(vice, now, 'week')
            return {
              used: used.size,
              allowed: dayLimit.days.length,
              todayCounts: used.has(toLocalDayKey(now)),
              openToday: dayLimit.days.includes(now.getDay()),
            }
          }

          const used = daysUsedIn(vice, now, dayLimit.period)
          const todayCounts = used.has(toLocalDayKey(now))

          return {
            used: used.size,
            allowed: dayLimit.days,
            todayCounts,
            openToday: todayCounts || used.size < dayLimit.days,
          }
        })()

  const shutForToday = days !== undefined && !days.openToday

  const full = {
    capacity: vice.capacity,
    available: shutForToday ? 0 : available,
    onCooldown,
    over,
    ...(days === undefined ? {} : { days }),
  }

  /*
   * On a calendar cycle the whole pool returns at the boundary, so there
   * is no "next charge" to name — `nextBackAt` is the reset, and the
   * screen says "resets" rather than "+1" for exactly that reason.
   */
  if (cycle.kind === 'calendar') {
    if (available >= vice.capacity) return full
    return { ...full, nextBackAt: periodEnd(now, cycle.period) }
  }

  /*
   * The oldest spend still inside the window is the next to expire. When
   * the pool is over capacity that is still the right answer: it is when
   * the overrun shrinks by one, which is the thing worth showing.
   */
  const oldest = active[0]
  if (available >= vice.capacity || oldest === undefined) return full

  return { ...full, nextBackAt: new Date(oldest.at + cycle.hours * HOUR_MS) }
}

/** How a pool's limit reads in a sentence — "4 a week", "2 every 12h". */
export function describeCycle(vice: Vice): string {
  const cycle = cycleOf(vice)

  const amount =
    vice.unit === undefined ? String(vice.capacity) : `${String(vice.capacity)} ${vice.unit}`

  const limit =
    cycle.kind === 'calendar'
      ? `${amount} ${CHARGE_PERIOD_LABELS[cycle.period]}`
      : `${amount}, one back every ${String(cycle.hours)}h`

  const dayLimit = vice.daysLimit
  if (dayLimit === undefined) return limit

  if (dayLimit.kind === 'days-of-week') {
    return `${limit}, on ${namedDays(dayLimit.days)}`
  }

  return `${limit}, on ${String(dayLimit.days)} day${
    dayLimit.days === 1 ? '' : 's'
  } ${CHARGE_PERIOD_LABELS[dayLimit.period]}`
}

/**
 * Records a spend. It never refuses, and it never refuses a size either.
 *
 * `amount` is in the pool's own units — one beer, or ninety-five
 * milligrams of caffeine — and defaults to one so a counting pool is
 * unchanged.
 */
export function spendCharge(vice: Vice, now: Date, amount = 1): Vice {
  return { ...vice, spent: [...vice.spent, spendEntry(now, amount)] }
}

/**
 * Taking back the most recent spend, for a mis-tap.
 *
 * The only destructive operation here, and it removes the *latest*
 * stamp rather than any chosen one — an undo, not an editor. Being able
 * to reach back and delete an inconvenient Friday would make the record
 * something you curate, and this is the one place in the app where the
 * value of the number depends entirely on not doing that.
 */
export function undoLastCharge(vice: Vice): Vice {
  if (vice.spent.length === 0) return vice

  const latest = [...vice.spent].sort((a, b) => Date.parse(a) - Date.parse(b)).slice(0, -1)

  return { ...vice, spent: latest }
}

export function isActive(vice: Vice): boolean {
  return vice.retiredAt === undefined
}

/** The rolling window a pool would use, for an editor's default. */
export function rollingHours(vice: Vice): number {
  const cycle = cycleOf(vice)
  return cycle.kind === 'rolling' ? cycle.hours : DEFAULT_ROLLING_HOURS
}
