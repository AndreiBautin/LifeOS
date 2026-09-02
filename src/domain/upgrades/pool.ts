import type { FinanceReading } from '@/domain/finance/reading'
import { isOwned, type Upgrade } from '@/domain/upgrades/upgrade'

/**
 * What there is to spend, derived from what was banked and what was
 * bought.
 *
 * Asked for as _"at the end of the month, whatever surplus I have
 * leftover will be added to the pool to spend of that, and this will
 * help me decide what to get next."_
 *
 * **Derived, never stored, which is the whole reason it can be
 * trusted.** A running balance is a number nothing can check: it drifts
 * the first time a write is lost, it cannot survive two devices each
 * incrementing it, and a mistyped entry is invisible forever after. Both
 * halves of this are records that already exist and are already synced —
 * a monthly surplus on the finance reading, and the cost of an upgrade
 * marked purchased — so the pool is an opinion about records rather than
 * a record of its own.
 *
 * That is the same argument `readCharges` makes about a token bucket and
 * `tallyActs` makes about an XP counter. It is the third time in this
 * app that a stored total was the obvious build and the wrong one.
 *
 * **It replaces the device-local budget box.** That was a single number
 * in `localStorage`, deliberately not synced, which meant the phone and
 * the laptop disagreed about what was affordable and neither was
 * inspectable. What is banked now travels with the finance readings.
 */
export interface SpendingPool {
  /** Every surplus ever recorded, added up. */
  readonly bankedMinor: number
  /** What the upgrades marked purchased cost. */
  readonly spentMinor: number
  /**
   * Banked minus spent, and **allowed to be negative**.
   *
   * Not clamped at zero, for the reason `ChargeReading.over` is separate
   * from `available`: an overspend is the one month worth noticing, and
   * flooring it would forget it by the next one — the pool would quietly
   * refill to the next surplus rather than starting from the hole. The
   * screen can clamp a bar; the record must not.
   */
  readonly availableMinor: number
  /** How many months have actually been tallied. */
  readonly monthsBanked: number
  /**
   * Purchases with no cost recorded.
   *
   * Reported rather than folded in as zero, the rule `wishlistTotal`
   * already follows: something bought for an unrecorded amount is not
   * something bought for nothing, and a pool that assumed otherwise
   * would read high in exactly the direction that matters.
   */
  readonly unpricedPurchases: number
}

export function spendingPool(
  readings: readonly FinanceReading[],
  upgrades: readonly Upgrade[],
): SpendingPool {
  const banked = readings.filter((reading) => reading.surplusMinor !== undefined)
  const bankedMinor = banked.reduce((total, reading) => total + (reading.surplusMinor ?? 0), 0)

  const purchased = upgrades.filter(isOwned)
  const spentMinor = purchased.reduce(
    (total, upgrade) => total + (upgrade.estimatedCostMinorUnits ?? 0),
    0,
  )

  return {
    bankedMinor,
    spentMinor,
    availableMinor: bankedMinor - spentMinor,
    monthsBanked: banked.length,
    unpricedPurchases: purchased.filter((upgrade) => upgrade.estimatedCostMinorUnits === undefined)
      .length,
  }
}
