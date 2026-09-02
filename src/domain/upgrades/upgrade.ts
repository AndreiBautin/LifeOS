import type { UpgradeId } from '@/domain/ids/ids'
import type { RecordHome } from '@/domain/base/base'

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

/**
 * Two shelves — see `shelf.ts` for what each means and why.
 *
 * The names live here rather than beside their functions because the
 * `shelf` field below needs the type, and `shelf.ts` needs `Upgrade`:
 * declaring it there made a cycle that quietly resolved every
 * `TreeEntry` to `any`.
 *
 * **There were three, and `gear` is gone.** Asked for: *"I don't really
 * have anything in gear that I want right now and don't foresee typing
 * progress to that — let's get rid of it."* A shelf nobody files to is a
 * screen, a route, a wishlist and a set of labels earning nothing, and
 * the split it existed for — you versus your tools — was never the
 * expensive one. `base` against everything else is.
 *
 * Nothing is orphaned: `shelfOf` reads a stored `gear` as `tech`, so a
 * pair of boots filed there before this appears in the tech tree rather
 * than nowhere. A derivation, not a migration, the rule this file
 * already follows for an absent shelf.
 */
export const UPGRADE_SHELVES = ['base', 'tech'] as const

export type UpgradeShelf = (typeof UPGRADE_SHELVES)[number]

export const UPGRADE_CATEGORIES = [
  'home',
  'office',
  'gym',
  'technology',
  'vehicle',
  // Added with the gear shelf, which had nowhere to put what it is for:
  // a pair of boots was 'lifestyle' or 'other', and these are also the
  // avatar's slots, so the portrait had no way to show them either.
  'apparel',
  'accessories',
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
  apparel: 'Apparel',
  accessories: 'Accessories',
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
  /**
   * Which of the three shelves this sits on — see `shelf.ts`.
   *
   * Optional because stored records outlive the type that wrote them,
   * and absent reads as the two-way split that shipped: Base if it was
   * filed there, the tech tree otherwise. Read it through `shelfOf`
   * rather than directly, or a record written before shelves existed
   * reads as having no shelf at all.
   */
  readonly shelf?: UpgradeShelf
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
