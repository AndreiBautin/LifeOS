import type { Tier } from './tiers'

/**
 * Whether a lifter's tiers still match the ones the app ships.
 *
 * Settings are legitimately the lifter's own — nothing here overwrites
 * them — but that creates a gap the app was silent about. A tier list
 * saved months ago goes on being used after the shipped defaults have
 * moved underneath it, and the screen showing "Squat, tier 2" is telling
 * the truth about a choice the lifter may not remember making.
 *
 * So the divergence is reported rather than resolved. Knowing your
 * priorities differ from the defaults is the whole of what is missing;
 * what to do about it stays a decision.
 *
 * Compared by membership, not by shape. Tier order within the list and
 * the order of members inside a tier are presentation, and a lifter who
 * dragged two muscles into the same tier in a different sequence has not
 * diverged from anything.
 */
export function tiersMatch<T extends string>(
  a: readonly Tier<T>[],
  b: readonly Tier<T>[],
): boolean {
  const shape = (tiers: readonly Tier<T>[]): string =>
    tiers
      .filter((tier) => tier.members.length > 0)
      .map((tier) => `${String(tier.rank)}:${[...tier.members].sort().join(',')}`)
      .sort()
      .join('|')

  return shape(a) === shape(b)
}
