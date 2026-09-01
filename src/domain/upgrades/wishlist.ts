import { isOpen, isOwned, type Upgrade } from '@/domain/upgrades/upgrade'

/**
 * What is still wanted, and what it comes to.
 *
 * The Base list was flat: everything on the house shelf in one column
 * with a Wanted or Owned badge to tell them apart. That is fine at three
 * rows and stops being fine at fifteen, because the two answer different
 * questions — *what is in the house* against *what am I saving for* —
 * and a badge is a poor substitute for a heading when the second is what
 * you opened the screen to read.
 */

export function wanted(upgrades: readonly Upgrade[]): readonly Upgrade[] {
  return [...upgrades]
    .filter(isOpen)
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title))
}

export function owned(upgrades: readonly Upgrade[]): readonly Upgrade[] {
  return [...upgrades].filter(isOwned).sort((a, b) => a.title.localeCompare(b.title))
}

/**
 * Things decided against, kept reachable.
 *
 * **Cancelled belongs in neither of the lists above and must still be
 * somewhere.** The tech tree showed it inside the tree itself — its
 * filter was `status !== 'purchased'`, so a dropped upgrade sat among
 * the live ones and could be offered under "what you can get today",
 * which is the screen recommending something you had decided against.
 * Base then went the other way and rendered it nowhere at all, which is
 * worse: the only control that could un-cancel it is on the row, and the
 * row had stopped existing.
 *
 * So: its own short list, last, on both screens.
 */
export function dropped(upgrades: readonly Upgrade[]): readonly Upgrade[] {
  return [...upgrades]
    .filter((one) => one.status === 'cancelled')
    .sort((a, b) => a.title.localeCompare(b.title))
}

export interface WishlistTotal {
  /** The sum of the costs that exist. Integer minor units. */
  readonly minorUnits: number
  /** How many rows that sum is made of. */
  readonly priced: number
  /**
   * How many carry no cost at all.
   *
   * **Named rather than folded in as zero**, which is the whole reason
   * this is a type and not a `reduce` at the call site. A dishwasher
   * with no estimate is not a free dishwasher, and a total that quietly
   * treated it as one would be understated in the direction that matters
   * — you would be saving for a figure the list cannot support.
   */
  readonly unpriced: number
}

export function wishlistTotal(upgrades: readonly Upgrade[]): WishlistTotal {
  const open = upgrades.filter(isOpen)
  const costs = open
    .map((one) => one.estimatedCostMinorUnits)
    .filter((one): one is number => one !== undefined)

  return {
    minorUnits: costs.reduce((sum, one) => sum + one, 0),
    priced: costs.length,
    unpriced: open.length - costs.length,
  }
}
