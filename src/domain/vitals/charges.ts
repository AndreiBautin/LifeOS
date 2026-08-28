import type { ViceId } from '@/domain/ids/ids'

/**
 * Things you mean to have less of, as a pool of charges that comes back.
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

export interface Vice {
  readonly id: ViceId
  readonly name: string
  /** How many charges the pool holds when full. At least one. */
  readonly capacity: number
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
}

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
    .map((stamp) => Date.parse(stamp))
    .filter((at) => Number.isFinite(at) && at > cutoff)
    .sort((a, b) => a - b)

  const onCooldown = active.length
  const available = Math.max(0, vice.capacity - onCooldown)
  const over = Math.max(0, onCooldown - vice.capacity)

  const full = { capacity: vice.capacity, available, onCooldown, over }

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

  return { ...full, nextBackAt: new Date(oldest + cycle.hours * HOUR_MS) }
}

/** How a pool's limit reads in a sentence — "4 a week", "2 every 12h". */
export function describeCycle(vice: Vice): string {
  const cycle = cycleOf(vice)

  return cycle.kind === 'calendar'
    ? `${String(vice.capacity)} ${CHARGE_PERIOD_LABELS[cycle.period]}`
    : `${String(vice.capacity)}, one back every ${String(cycle.hours)}h`
}

/** Spending a charge records that it happened. It never refuses. */
export function spendCharge(vice: Vice, now: Date): Vice {
  return { ...vice, spent: [...vice.spent, now.toISOString()] }
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
