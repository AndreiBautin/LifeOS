import { gatesFor, isAvailable, type Gate, type TreeNode } from '@/domain/game/tree'
import type { UpgradeId } from '@/domain/ids/ids'

import { isOwned, type Upgrade } from './upgrade'

/**
 * Priority, propagated up the prerequisite chain.
 *
 * Sixty-one lines in the original and the whole reason the app exists: a
 * node inherits the priority of the most important thing it unblocks, so
 * a dull desk that stands between you and the monitor arm you actually
 * want sorts as high as the arm does. Buying it is the first step.
 *
 * The walk is memoised and guarded by a `visiting` set. That guard is not
 * for this walk's benefit — cycles are refused on the way in — it stops an
 * *already* corrupt chain from recursing forever, so a bad record degrades
 * to "no inheritance" rather than hanging the page.
 */

export interface Recommendation {
  /** True while the prerequisite is unpurchased. */
  readonly isBlocked: boolean
  /** The raw priority, or a descendant's if that is higher. */
  readonly effectivePriority: number
  /** The descendant the priority came from, if it came from one. */
  readonly unlocksId?: UpgradeId
  readonly unlocksTitle?: string
}

export function computeRecommendations(
  upgrades: readonly Upgrade[],
): ReadonlyMap<UpgradeId, Recommendation> {
  const byId = new Map(upgrades.map((upgrade) => [upgrade.id, upgrade]))

  const childrenOf = new Map<UpgradeId, Upgrade[]>()
  for (const upgrade of upgrades) {
    if (upgrade.prerequisiteId === undefined) continue
    const siblings = childrenOf.get(upgrade.prerequisiteId) ?? []
    siblings.push(upgrade)
    childrenOf.set(upgrade.prerequisiteId, siblings)
  }

  const memo = new Map<UpgradeId, { priority: number; sourceId: UpgradeId }>()

  function best(
    id: UpgradeId,
    visiting: Set<UpgradeId>,
  ): { priority: number; sourceId: UpgradeId } {
    const cached = memo.get(id)
    if (cached !== undefined) return cached

    const upgrade = byId.get(id)
    if (upgrade === undefined) return { priority: 0, sourceId: id }

    // Already on the stack: a corrupt chain. Treat the node as its own
    // source rather than recursing into the loop.
    if (visiting.has(id)) return { priority: upgrade.priority, sourceId: id }
    visiting.add(id)

    let winner = { priority: upgrade.priority, sourceId: id }

    for (const child of childrenOf.get(id) ?? []) {
      const fromChild = best(child.id, visiting)
      if (fromChild.priority > winner.priority) winner = fromChild
    }

    visiting.delete(id)
    memo.set(id, winner)
    return winner
  }

  return new Map(
    upgrades.map((upgrade) => {
      const { priority, sourceId } = best(upgrade.id, new Set())

      const prerequisite =
        upgrade.prerequisiteId === undefined ? undefined : byId.get(upgrade.prerequisiteId)
      const unlocks = sourceId === upgrade.id ? undefined : byId.get(sourceId)

      return [
        upgrade.id,
        {
          // A dangling prerequisite blocks nothing. The reference names a
          // record that is not here, and refusing to let anything be
          // bought because of it would be the app enforcing a rule
          // against evidence it does not have.
          isBlocked: prerequisite !== undefined && !isOwned(prerequisite),
          effectivePriority: priority,
          ...(unlocks === undefined ? {} : { unlocksId: unlocks.id, unlocksTitle: unlocks.title }),
        },
      ]
    }),
  )
}

/**
 * An upgrade as the game model's tree node.
 *
 * The projection is the point: `domain/game/tree.ts` decides what may gate
 * a node — money, and a prerequisite that physically holds — and this is
 * the domain that has to obey it. Nothing here is bought with points.
 */
export function toTreeNode(upgrade: Upgrade): TreeNode {
  return {
    id: upgrade.id,
    title: upgrade.title,
    ...(upgrade.prerequisiteId === undefined ? {} : { prerequisiteId: upgrade.prerequisiteId }),
    costMinorUnits: upgrade.estimatedCostMinorUnits ?? 0,
    priority: upgrade.priority,
    owned: isOwned(upgrade),
  }
}

export function indexTreeNodes(upgrades: readonly Upgrade[]): ReadonlyMap<string, TreeNode> {
  return new Map(upgrades.map((upgrade) => [upgrade.id as string, toTreeNode(upgrade)]))
}

export interface TreeEntry {
  readonly upgrade: Upgrade
  readonly recommendation: Recommendation
  /** What stands in the way today: money, a prerequisite, or both. */
  readonly gates: readonly Gate[]
  /** Nothing in the way, and not already owned. */
  readonly affordable: boolean
}

/**
 * The whole tree, ranked, with today's budget applied.
 *
 * Purchased and cancelled entries are dropped from the ranking — neither
 * is something money can still be spent on. Blocked ones stay: seeing
 * *why* the highest-priority thing is unavailable is the point of the
 * view, and hiding it would leave the list quietly missing its best entry.
 */
export function rankTree(
  upgrades: readonly Upgrade[],
  availableMinorUnits: number,
): readonly TreeEntry[] {
  const recommendations = computeRecommendations(upgrades)
  const nodes = indexTreeNodes(upgrades)

  return upgrades
    .map((upgrade): TreeEntry => {
      const node = toTreeNode(upgrade)

      return {
        upgrade,
        recommendation: recommendations.get(upgrade.id) ?? {
          isBlocked: false,
          effectivePriority: upgrade.priority,
        },
        gates: gatesFor(node, nodes, availableMinorUnits),
        affordable: isAvailable(node, nodes, availableMinorUnits),
      }
    })
    .toSorted((a, b) => {
      const byEffective = b.recommendation.effectivePriority - a.recommendation.effectivePriority
      if (byEffective !== 0) return byEffective

      return b.upgrade.priority - a.upgrade.priority
    })
}

/**
 * Would pointing this upgrade at that prerequisite close a loop?
 *
 * Walks the proposed prerequisite's own ancestry looking for the upgrade
 * being edited. The `seen` set stops an already-corrupt chain spinning
 * forever, so a bad record degrades to "no cycle found" rather than
 * hanging.
 *
 * This used to be enforced in the database as well, by `DeleteBehavior`
 * and a foreign key. Neither survives the move to IndexedDB, so this is
 * now the only thing standing between a loop and a tree that cannot be
 * drawn.
 */
export function wouldCreateCycle(
  upgrades: readonly Upgrade[],
  upgradeId: UpgradeId,
  prerequisiteId: UpgradeId | undefined,
): boolean {
  if (prerequisiteId === undefined) return false

  const byId = new Map(upgrades.map((upgrade) => [upgrade.id, upgrade]))
  const seen = new Set<UpgradeId>()

  let current: UpgradeId | undefined = prerequisiteId

  while (current !== undefined) {
    if (current === upgradeId) return true
    if (seen.has(current)) break
    seen.add(current)

    current = byId.get(current)?.prerequisiteId
  }

  return false
}

/** Ids of the upgrades that name this one as their prerequisite. */
export function dependentsOf(
  upgrades: readonly Upgrade[],
  upgradeId: UpgradeId,
): readonly UpgradeId[] {
  return upgrades
    .filter((upgrade) => upgrade.prerequisiteId === upgradeId)
    .map((upgrade) => upgrade.id)
}
