import { describe, expect, it } from 'vitest'

import { asUpgradeId, type UpgradeId } from '@/domain/ids/ids'

import {
  computeRecommendations,
  dependentsOf,
  rankTree,
  toTreeNode,
  wouldCreateCycle,
} from './recommendation'
import type { Upgrade, UpgradeStatus } from './upgrade'

/**
 * Ported from `RecommendationEngineTests.cs`, which was already a
 * pure-function suite over in-memory objects — no database, no HTTP, no
 * fixtures. The additions at the end are the two rules the *database* was
 * enforcing alongside the code, and which now have nothing else behind
 * them.
 */

const id = (name: string): UpgradeId => asUpgradeId(name)

function anUpgrade(name: string, priority: number, overrides: Partial<Upgrade> = {}): Upgrade {
  return {
    id: id(name),
    title: name,
    category: 'office',
    priority,
    status: 'idea',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('priority through the prerequisite graph', () => {
  /*
   * The rule the whole product rests on. A dull desk that stands between
   * you and the arm you actually want sorts as high as the arm does,
   * because buying it is the first step.
   */
  it('propagates up a prerequisite chain', () => {
    const desk = anUpgrade('Desk', 70)
    const monitor = anUpgrade('Monitor', 75, { prerequisiteId: desk.id })
    const arm = anUpgrade('Arm', 92, { prerequisiteId: monitor.id })

    const result = computeRecommendations([desk, monitor, arm])

    expect(result.get(desk.id)?.effectivePriority).toBe(92)
    expect(result.get(monitor.id)?.effectivePriority).toBe(92)
    expect(result.get(arm.id)?.effectivePriority).toBe(92)
  })

  it('names the descendant the priority came from', () => {
    const desk = anUpgrade('Desk', 70)
    const monitor = anUpgrade('Monitor', 75, { prerequisiteId: desk.id })
    const arm = anUpgrade('Arm', 92, { prerequisiteId: monitor.id })

    const result = computeRecommendations([desk, monitor, arm])

    // Not the immediate child — the highest-priority descendant.
    expect(result.get(desk.id)?.unlocksTitle).toBe('Arm')
    expect(result.get(desk.id)?.unlocksId).toBe(arm.id)
  })

  it('reports no source for something that unlocks nothing', () => {
    const lonely = anUpgrade('Lamp', 40)

    const result = computeRecommendations([lonely])

    expect(result.get(lonely.id)).toEqual({ isBlocked: false, effectivePriority: 40 })
  })

  it('does not drag a high-priority parent down to its child', () => {
    const parent = anUpgrade('Parent', 90)
    const child = anUpgrade('Child', 10, { prerequisiteId: parent.id })

    const result = computeRecommendations([parent, child])

    expect(result.get(parent.id)?.effectivePriority).toBe(90)
    expect(result.get(parent.id)?.unlocksId).toBeUndefined()
  })

  it('takes the highest of several children', () => {
    const root = anUpgrade('Root', 10)
    const low = anUpgrade('Low', 30, { prerequisiteId: root.id })
    const high = anUpgrade('Winner', 80, { prerequisiteId: root.id })

    const result = computeRecommendations([root, low, high])

    expect(result.get(root.id)?.effectivePriority).toBe(80)
    expect(result.get(root.id)?.unlocksTitle).toBe('Winner')
  })

  it('produces nothing from nothing', () => {
    expect(computeRecommendations([]).size).toBe(0)
  })
})

describe('blocking', () => {
  it('blocks while the prerequisite is unpurchased', () => {
    const desk = anUpgrade('Desk', 70, { status: 'ready-to-buy' })
    const monitor = anUpgrade('Monitor', 75, { prerequisiteId: desk.id })

    const result = computeRecommendations([desk, monitor])

    expect(result.get(desk.id)?.isBlocked).toBe(false)
    expect(result.get(monitor.id)?.isBlocked).toBe(true)
  })

  it('unblocks once the prerequisite is purchased', () => {
    const desk = anUpgrade('Desk', 70, { status: 'purchased' })
    const monitor = anUpgrade('Monitor', 75, { prerequisiteId: desk.id })

    expect(computeRecommendations([desk, monitor]).get(monitor.id)?.isBlocked).toBe(false)
  })

  /*
   * "Ready to buy" is a state of mind. A gate that opened on it would let
   * you mount the arm on a desk you have only decided to order.
   */
  it.each<UpgradeStatus>(['idea', 'researching', 'ready-to-buy', 'cancelled'])(
    'stays blocked while the prerequisite is %s',
    (status) => {
      const prerequisite = anUpgrade('Prerequisite', 50, { status })
      const dependent = anUpgrade('Dependent', 60, { prerequisiteId: prerequisite.id })

      expect(computeRecommendations([prerequisite, dependent]).get(dependent.id)?.isBlocked).toBe(
        true,
      )
    },
  )

  it('never blocks something with no prerequisite', () => {
    const result = computeRecommendations([anUpgrade('A', 50), anUpgrade('B', 90)])

    expect([...result.values()].map((one) => one.isBlocked)).toEqual([false, false])
  })

  /*
   * The foreign key made this unreachable through the API. Nothing
   * enforces it now, and the engine is a pure function anything could
   * hand a partial list to — including a sync that delivered a child
   * before its parent.
   */
  it('treats a dangling prerequisite as no prerequisite', () => {
    const orphan = anUpgrade('Orphan', 50, { prerequisiteId: id('gone') })

    const result = computeRecommendations([orphan])

    expect(result.get(orphan.id)).toEqual({ isBlocked: false, effectivePriority: 50 })
  })

  it('terminates on a chain that is already a cycle', () => {
    const a = anUpgrade('A', 10, { prerequisiteId: id('B') })
    const b = anUpgrade('B', 20, { prerequisiteId: id('A') })

    expect(computeRecommendations([a, b]).size).toBe(2)
  })
})

describe('wouldCreateCycle', () => {
  it('is false when there is no prerequisite at all', () => {
    expect(wouldCreateCycle([anUpgrade('A', 10)], id('A'), undefined)).toBe(false)
  })

  it('catches a direct two-node loop', () => {
    const a = anUpgrade('A', 10)
    const b = anUpgrade('B', 20, { prerequisiteId: a.id })

    expect(wouldCreateCycle([a, b], a.id, b.id)).toBe(true)
  })

  it('catches a longer transitive loop', () => {
    const a = anUpgrade('A', 10)
    const b = anUpgrade('B', 20, { prerequisiteId: a.id })
    const c = anUpgrade('C', 30, { prerequisiteId: b.id })

    expect(wouldCreateCycle([a, b, c], a.id, c.id)).toBe(true)
  })

  it('allows an unrelated prerequisite', () => {
    const a = anUpgrade('A', 10)
    const b = anUpgrade('B', 20)

    expect(wouldCreateCycle([a, b], a.id, b.id)).toBe(false)
  })

  it('terminates on a chain that is already corrupt', () => {
    const a = anUpgrade('A', 10, { prerequisiteId: id('B') })
    const b = anUpgrade('B', 20, { prerequisiteId: id('A') })

    expect(wouldCreateCycle([a, b], id('C'), a.id)).toBe(false)
  })
})

describe('dependentsOf', () => {
  /*
   * The source refused to delete anything with dependents, and the
   * database refused too via `DeleteBehavior.Restrict`. Only the code half
   * survives, so this is what the refusal is now built on.
   */
  it('finds what would be orphaned', () => {
    const desk = anUpgrade('Desk', 70)
    const monitor = anUpgrade('Monitor', 75, { prerequisiteId: desk.id })
    const lamp = anUpgrade('Lamp', 20)

    expect(dependentsOf([desk, monitor, lamp], desk.id)).toEqual([monitor.id])
    expect(dependentsOf([desk, monitor, lamp], lamp.id)).toEqual([])
  })
})

describe('the tree, with a budget', () => {
  const desk = anUpgrade('Desk', 70, { estimatedCostMinorUnits: 40_000 })
  const arm = anUpgrade('Arm', 92, {
    prerequisiteId: desk.id,
    estimatedCostMinorUnits: 9_000,
  })

  /*
   * Inheritance lifts the desk to the arm's 92, so the two tie — and the
   * tie breaks on raw priority, which puts the arm on top with the desk
   * directly beneath it. That is the source's ordering, kept: the thing
   * you actually want leads, the step that reaches it sits under it, and
   * `isBlocked` is what says which of the two you can act on. Ranking the
   * ancestor first instead would read as the app deciding it knows better
   * than the numbers it was given.
   */
  it('lifts a prerequisite to the priority of what it unblocks', () => {
    const ranked = rankTree([desk, arm], 100_000)

    expect(ranked.map((entry) => entry.upgrade.title)).toEqual(['Arm', 'Desk'])
    expect(ranked.map((entry) => entry.recommendation.effectivePriority)).toEqual([92, 92])

    // The arm leads the list and is the one you cannot act on.
    expect(ranked[0]?.affordable).toBe(false)
    expect(ranked[1]?.affordable).toBe(true)
  })

  it('marks what today’s money cannot reach, with the shortfall', () => {
    const ranked = rankTree([desk, arm], 25_000)
    const deskEntry = ranked.find((entry) => entry.upgrade.id === desk.id)

    expect(deskEntry?.affordable).toBe(false)
    expect(deskEntry?.gates).toEqual([{ kind: 'money', shortfallMinorUnits: 15_000 }])
  })

  /*
   * Both gates, not the first one. "You cannot afford this and you do not
   * own the desk it mounts to" is two facts, and reporting one makes the
   * tree look a purchase closer than it is.
   */
  it('reports the prerequisite and the shortfall together', () => {
    const ranked = rankTree([desk, arm], 0)
    const armEntry = ranked.find((entry) => entry.upgrade.id === arm.id)

    expect(armEntry?.gates).toEqual([
      { kind: 'prerequisite', nodeId: desk.id, title: 'Desk' },
      { kind: 'money', shortfallMinorUnits: 9_000 },
    ])
  })

  it('stops gating the arm once the desk is owned', () => {
    const bought = { ...desk, status: 'purchased' as const }
    const ranked = rankTree([bought, arm], 100_000)

    expect(ranked.find((entry) => entry.upgrade.id === arm.id)?.gates).toEqual([])
  })

  it('never offers something already owned', () => {
    const bought = { ...desk, status: 'purchased' as const }

    expect(rankTree([bought], 100_000)[0]?.affordable).toBe(false)
  })
})

describe('toTreeNode', () => {
  /*
   * The projection is the point: `domain/game/tree.ts` owns what may gate
   * a node, and this is the domain that has to obey it. An upgrade with no
   * estimate costs nothing to reach, which is right — an absent estimate
   * is missing information, not a price.
   */
  it('maps an upgrade onto the game model’s node', () => {
    expect(toTreeNode(anUpgrade('Desk', 70, { status: 'purchased' }))).toEqual({
      id: id('Desk'),
      title: 'Desk',
      costMinorUnits: 0,
      priority: 70,
      owned: true,
    })
  })
})
