import { describe, expect, it } from 'vitest'

import { GATE_KINDS, gatesFor, isAvailable, type TreeNode } from './tree'

const desk: TreeNode = {
  id: 'desk',
  title: 'Standing desk',
  costMinorUnits: 40_000,
  priority: 3,
  owned: false,
}

const arm: TreeNode = {
  id: 'arm',
  title: 'Monitor arm',
  prerequisiteId: 'desk',
  costMinorUnits: 9_000,
  priority: 5,
  owned: false,
}

const index = (...nodes: TreeNode[]): ReadonlyMap<string, TreeNode> =>
  new Map(nodes.map((node) => [node.id, node]))

describe('gatesFor', () => {
  it('reports an unmet prerequisite', () => {
    expect(gatesFor(arm, index(desk, arm), 100_000)).toEqual([
      { kind: 'prerequisite', nodeId: 'desk', title: 'Standing desk' },
    ])
  })

  it('reports the shortfall when the money is not there', () => {
    expect(gatesFor(desk, index(desk, arm), 25_000)).toEqual([
      { kind: 'money', shortfallMinorUnits: 15_000 },
    ])
  })

  /*
   * Both, not the first one. Reporting a single gate makes the tree look
   * one purchase closer than it is, which is the failure mode that would
   * be invisible from the screen — everything renders, one line is
   * missing.
   */
  it('reports both gates when both hold', () => {
    expect(gatesFor(arm, index(desk, arm), 0)).toEqual([
      { kind: 'prerequisite', nodeId: 'desk', title: 'Standing desk' },
      { kind: 'money', shortfallMinorUnits: 9_000 },
    ])
  })

  it('stops gating once the prerequisite is owned', () => {
    expect(gatesFor(arm, index({ ...desk, owned: true }, arm), 100_000)).toEqual([])
  })

  it('ignores a prerequisite that is not in the index', () => {
    const orphan: TreeNode = { ...arm, prerequisiteId: 'gone' }

    expect(gatesFor(orphan, index(orphan), 100_000)).toEqual([])
  })
})

describe('isAvailable', () => {
  it('is false for something already owned, however clear the path', () => {
    expect(isAvailable({ ...desk, owned: true }, index(desk), 100_000)).toBe(false)
  })

  it('is true for an ungated node you do not have yet', () => {
    expect(isAvailable(desk, index(desk), 100_000)).toBe(true)
  })
})

/*
 * The guard, not a description.
 *
 * "Let XP unlock the cheap ones" is a small, reasonable-sounding change
 * that turns the whole model into a slot machine, and it would arrive in a
 * commit whose message is about something else entirely. Widening this
 * list should require deleting a test that says why not.
 */
describe('what may gate a node', () => {
  it('is money and prerequisites, and nothing bought with points', () => {
    expect(GATE_KINDS).toEqual(['money', 'prerequisite'])
  })
})
