import type { UpgradeId } from '@/domain/ids/ids'

/**
 * Something you are saving up for, and what has to come first.
 *
 * The most natively gamified thing in the portfolio: its engine already
 * returned `UnlocksUpgradeId` and `UnlocksTitle` — skill-tree vocabulary,
 * sitting in a purchase planner. It renders as the tree it always was.
 *
 * Two decisions carried over from the source, one kept and one changed.
 *
 * **One parent, kept.** `prerequisiteId` is a single optional id rather
 * than a list. The engine's shape assumes it, and widening it is a real
 * change rather than a field edit: with several parents, "unlocked" would
 * have to decide between all-of-them and any-of-them, and neither reads
 * off the physical fact the gate represents. Note the contrast with
 * `domain/projects/` — a project waits on *several* things, because
 * waiting genuinely is plural, and it has a list. This is a different
 * relation wearing a similar shape.
 *
 * **Decimal money, changed.** Costs are integer minor units. JavaScript
 * has no decimal type, and a budget filter built on binary floating point
 * is one that eventually disagrees with itself about whether something is
 * affordable.
 */

export const UPGRADE_CATEGORIES = [
  'home',
  'office',
  'gym',
  'technology',
  'vehicle',
  'lifestyle',
  'other',
] as const

export type UpgradeCategory = (typeof UPGRADE_CATEGORIES)[number]

export const UPGRADE_CATEGORY_LABELS: Readonly<Record<UpgradeCategory, string>> = {
  home: 'Home',
  office: 'Office',
  gym: 'Gym',
  technology: 'Technology',
  vehicle: 'Vehicle',
  lifestyle: 'Lifestyle',
  other: 'Other',
}

export const UPGRADE_STATUSES = [
  'idea',
  'researching',
  'ready-to-buy',
  'purchased',
  'cancelled',
] as const

export type UpgradeStatus = (typeof UPGRADE_STATUSES)[number]

export const UPGRADE_STATUS_LABELS: Readonly<Record<UpgradeStatus, string>> = {
  idea: 'Idea',
  researching: 'Researching',
  'ready-to-buy': 'Ready to buy',
  purchased: 'Purchased',
  cancelled: 'Cancelled',
}

export const MIN_PRIORITY = 1
export const MAX_PRIORITY = 100

export interface Upgrade {
  readonly id: UpgradeId
  readonly title: string
  readonly description?: string
  readonly category: UpgradeCategory
  /** 1–100. Raw, before anything it unblocks has had its say. */
  readonly priority: number
  /** Minor units — cents, pence. Never a float. */
  readonly estimatedCostMinorUnits?: number
  readonly status: UpgradeStatus
  readonly notes?: string
  readonly productLink?: string
  readonly prerequisiteId?: UpgradeId
  readonly purchasedAt?: string
  readonly actualCostMinorUnits?: number
  readonly createdAt: string
  /** Written by the repository on save. */
  readonly updatedAt?: string
}

/**
 * Only a purchase counts as owning something.
 *
 * "Ready to buy" is a state of mind, and a gate that opened on it would
 * let you mount the arm on a desk you have decided to order.
 */
export function isOwned(upgrade: Upgrade): boolean {
  return upgrade.status === 'purchased'
}

/** Whether money can still be spent on this at all. */
export function isOpen(upgrade: Upgrade): boolean {
  return upgrade.status !== 'purchased' && upgrade.status !== 'cancelled'
}

/**
 * Minor units as a readable amount.
 *
 * No currency symbol, because the source carried no currency either —
 * one person, one currency, and inventing a code here would be the app
 * claiming to know something it was never told.
 */
export function formatMinorUnits(minorUnits: number): string {
  return (minorUnits / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * A decimal amount typed by a person, as minor units.
 *
 * Rounds rather than truncates, and returns `undefined` for anything that
 * is not a number — an empty field means "no estimate", which is not the
 * same as zero and must not become it.
 */
export function toMinorUnits(input: string): number | undefined {
  const trimmed = input.trim()
  if (trimmed === '') return undefined

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return undefined

  return Math.round(value * 100)
}
