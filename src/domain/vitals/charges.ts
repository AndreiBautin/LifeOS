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

export interface Vice {
  readonly id: ViceId
  readonly name: string
  /** How many charges the pool holds when full. At least one. */
  readonly capacity: number
  /**
   * How long one spent charge takes to come back.
   *
   * Hours rather than a cadence, because this is the thing that makes a
   * charge different from a daily allowance: two coffees a day resets at
   * midnight and invites a double espresso at 11pm, where two coffees on
   * a twelve-hour cooldown does not. The unit is what carries that.
   */
  readonly regenHours: number
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
  const cutoff = now.getTime() - vice.regenHours * HOUR_MS

  const active = vice.spent
    .map((stamp) => Date.parse(stamp))
    .filter((at) => Number.isFinite(at) && at > cutoff)
    .sort((a, b) => a - b)

  const onCooldown = active.length
  const available = Math.max(0, vice.capacity - onCooldown)
  const over = Math.max(0, onCooldown - vice.capacity)

  /*
   * The oldest spend still inside the window is the next to expire. When
   * the pool is over capacity that is still the right answer: it is when
   * the overrun shrinks by one, which is the thing worth showing.
   */
  const oldest = active[0]
  if (available >= vice.capacity || oldest === undefined) {
    return { capacity: vice.capacity, available, onCooldown, over }
  }

  return {
    capacity: vice.capacity,
    available,
    onCooldown,
    over,
    nextBackAt: new Date(oldest + vice.regenHours * HOUR_MS),
  }
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
