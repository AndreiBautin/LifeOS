import { BASE, isBase } from '@/domain/base/base'
import { UPGRADE_SHELVES, type Upgrade, type UpgradeShelf } from '@/domain/upgrades/upgrade'
import type { RecordHome } from '@/domain/base/base'

/**
 * Three shelves, because "is this the house or not" was answering two
 * questions at once.
 *
 * The report: *"base upgrades should be separate from the tech tree —
 * I put a MacBook and a monitor on base upgrades but those are tech,
 * while a desk and a couch are base"*, and alongside it a third:
 * *"gear/cosmetics to track apparel, shoes and accessories."*
 *
 * That is a real trichotomy rather than a longer list, and the question
 * it answers is **what does this upgrade upgrade**:
 *
 * - `base` — the place you live. A dishwasher, a desk, a couch.
 * - `tech` — the tools you work and play with. A phone, a monitor.
 * - `gear` — you. Apparel, shoes, accessories.
 *
 * The app already made the first cut and made it in one place: `isBase`
 * split the house from everything else, and everything else was the tech
 * tree by default. So a pair of boots and a graphics card sat on one
 * screen called Tech tree, which is why the split reads as overdue
 * rather than as new.
 *
 * **One record type, one wallet, one set of gates.** These are shelves,
 * not areas — the model allows exactly one area that *spends*
 * (`registry.test.ts` → "has exactly one tree") and three screens
 * showing one kind of record does not make three spenders. Same reason
 * Base has `hasTree: false`.
 */

export { UPGRADE_SHELVES, type UpgradeShelf }

export const UPGRADE_SHELF_LABELS: Readonly<Record<UpgradeShelf, string>> = {
  base: 'Base',
  tech: 'Tech tree',
}

export const UPGRADE_SHELF_BLURBS: Readonly<Record<UpgradeShelf, string>> = {
  base: 'The place you live — furniture, appliances, fittings',
  tech: 'The tools you work and play with — phones, screens, machines',
}

/**
 * Which shelf an upgrade sits on.
 *
 * **Absent means what it always meant**, which is the rule `belongsTo`
 * itself follows: filed to Base reads as `base`, and anything else reads
 * as `tech`. That is exactly the two-way split that shipped, so nothing
 * migrates and nothing moves on its own — a stored record written before
 * shelves existed lands where it already was.
 *
 * **A stored `gear` reads as `tech`**, which is the same derivation one
 * value further on. That shelf was removed for want of anything on it,
 * and a record still carrying the word would otherwise match no shelf
 * and be drawn by no screen — the silent loss this function exists to
 * prevent. It normalises the next time anything saves the record.
 */
export function shelfOf(upgrade: Upgrade): UpgradeShelf {
  // Widened, because the value is no longer in the field's own union:
  // the record on disk can still say it, and the type cannot.
  if ((upgrade.shelf as string | undefined) === RETIRED_GEAR_SHELF) return 'tech'
  if (upgrade.shelf !== undefined) return upgrade.shelf

  return isBase(upgrade) ? 'base' : 'tech'
}

/** What the third shelf was called before it was removed. */
const RETIRED_GEAR_SHELF = 'gear'

/**
 * The area a shelf files its records to.
 *
 * `belongsTo` stays the *area* answer — it is shared with projects and
 * dailies, and `baseContents`, `keepFor` and the "exactly one side" test
 * all read it. `shelf` is the finer answer that only upgrades have. The
 * two are kept in step by construction: there is one writer
 * (`moveUpgradeToShelf`) and it sets both in one save, which is the
 * `reshapeStage` lesson — two read-modify-writes of one record lose one
 * of them.
 */
export function homeForShelf(shelf: UpgradeShelf): RecordHome | undefined {
  return shelf === 'base' ? BASE : undefined
}

export function onShelf(upgrades: readonly Upgrade[], shelf: UpgradeShelf): readonly Upgrade[] {
  return upgrades.filter((one) => shelfOf(one) === shelf)
}
