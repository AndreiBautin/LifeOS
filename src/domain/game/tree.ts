/**
 * The tech tree — the one structure here that spends instead of measuring.
 *
 * Upgrades is already a skill tree wearing a purchase planner's clothes:
 * its `RecommendationEngine` returns `UnlocksUpgradeId` and
 * `UnlocksTitle`, which is skill-tree vocabulary. Phase 3 brings the
 * engine across; this file fixes the shape it lands in, and one rule about
 * what may gate a node.
 *
 * What makes a tree honest here, where an invented one would not be, is
 * that both its gates are externally real: money you actually have, and a
 * physical prerequisite that genuinely holds. You cannot mount the arm
 * before you own the desk. Nothing in this system buys a node with points.
 */

/**
 * The only two things that may stand between you and a node.
 *
 * Guarded by a test rather than left as a comment, because "just let XP
 * unlock the cheap ones" is a small, reasonable-sounding change that
 * converts the entire model into a slot machine, and it would arrive in a
 * commit about something else.
 */
export const GATE_KINDS = ['money', 'prerequisite'] as const

export type GateKind = (typeof GATE_KINDS)[number]

export type Gate =
  | { readonly kind: 'money'; readonly shortfallMinorUnits: number }
  | { readonly kind: 'prerequisite'; readonly nodeId: string; readonly title: string }

export interface TreeNode {
  readonly id: string
  readonly title: string
  /**
   * A single parent, matching the source schema's one nullable foreign
   * key. Phase 3 decides deliberately whether to keep the limit; widening
   * it is a real change to how effective priority propagates, not a field
   * that can be turned into an array on the way past.
   */
  readonly prerequisiteId?: string
  /**
   * Minor units — cents, pence. Never a float.
   *
   * The source column is `decimal`, which JavaScript has no equivalent
   * for, and a budget filter built on binary floating point is one that
   * eventually disagrees with itself about whether something is
   * affordable.
   */
  readonly costMinorUnits: number
  readonly priority: number
  readonly owned: boolean
}

/**
 * What is standing in the way of one node, right now.
 *
 * Both gates, not the first one: "you cannot afford this and you do not
 * own the desk it mounts to" is two facts, and reporting one of them makes
 * the tree look one purchase closer than it is.
 */
export function gatesFor(
  node: TreeNode,
  byId: ReadonlyMap<string, TreeNode>,
  availableMinorUnits: number,
): readonly Gate[] {
  const gates: Gate[] = []

  const prerequisite = node.prerequisiteId === undefined ? undefined : byId.get(node.prerequisiteId)

  if (prerequisite !== undefined && !prerequisite.owned) {
    gates.push({ kind: 'prerequisite', nodeId: prerequisite.id, title: prerequisite.title })
  }

  const shortfall = node.costMinorUnits - availableMinorUnits
  if (shortfall > 0) {
    gates.push({ kind: 'money', shortfallMinorUnits: shortfall })
  }

  return gates
}

/**
 * A node already owned is not gated by anything.
 *
 * Separate from `gatesFor` because the two answer different questions —
 * "what is in the way" and "can I act on this" — and a caller reading an
 * empty gate list as availability would offer to buy things twice.
 */
export function isAvailable(
  node: TreeNode,
  byId: ReadonlyMap<string, TreeNode>,
  availableMinorUnits: number,
): boolean {
  return !node.owned && gatesFor(node, byId, availableMinorUnits).length === 0
}
