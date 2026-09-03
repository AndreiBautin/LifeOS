import { describe, expect, it } from 'vitest'

import { branchId, layoutTree, TRUNK_ID, type LayoutInput } from './tree-layout'

function node(
  id: string,
  shelf: LayoutInput['shelf'],
  prerequisiteId?: string,
  priority = 50,
): LayoutInput {
  return {
    id,
    title: id,
    shelf,
    priority,
    ...(prerequisiteId === undefined ? {} : { prerequisiteId }),
  }
}

const at = (layout: ReturnType<typeof layoutTree>, id: string) =>
  layout.nodes.find((one) => one.id === id)

describe('layoutTree', () => {
  it('puts the trunk above the branches and the branches above the upgrades', () => {
    const layout = layoutTree([node('desk', 'base'), node('phone', 'tech')])

    expect(at(layout, TRUNK_ID)?.row).toBe(0)
    expect(at(layout, branchId('base'))?.row).toBe(1)
    expect(at(layout, 'desk')?.row).toBe(2)
    /* The second branch is below the first, not beside it. */
    expect(at(layout, branchId('tech'))?.row).toBeGreaterThan(2)
  })

  /*
   * A chain is what makes it a tree rather than two rows, so each link
   * has to drop a row.
   */
  it('nests a prerequisite chain one row deeper at each link', () => {
    const layout = layoutTree([
      node('desk', 'base'),
      node('lamp', 'base', 'desk'),
      node('bulb', 'base', 'lamp'),
    ])

    /*
     * **Relative to the branch, not to the canvas.** These were absolute
     * rows — 2, 3, 4 — which was the same thing while every branch's
     * roots sat on row 2. Branches stack into bands of their own now, so
     * a root's row depends on how deep the branches above it run, and an
     * absolute figure here would be asserting the *order of the shelves*
     * while claiming to assert nesting.
     */
    const base = at(layout, branchId('base'))?.row ?? 0

    expect(at(layout, 'desk')?.row).toBe(base + 1)
    expect(at(layout, 'lamp')?.row).toBe(base + 2)
    expect(at(layout, 'bulb')?.row).toBe(base + 3)
    expect(layout.rows).toBeGreaterThan(at(layout, 'bulb')?.row ?? 0)
  })

  /*
   * **The width is the widest branch, not the sum of them**, which is the
   * whole reason the bands exist. Two branches of three roots each came
   * out at seven columns side by side and read as "scroll all the way
   * over" on a phone; stacked they are three.
   */
  it('sizes the canvas to the widest branch rather than to every branch', () => {
    const layout = layoutTree([
      node('a', 'base'),
      node('b', 'base'),
      node('c', 'base'),
      node('x', 'tech'),
      node('y', 'tech'),
      node('z', 'tech'),
    ])

    expect(layout.cols).toBe(3)
  })

  /* And a band cannot overlap the one above it. */
  it('gives each branch a row band of its own', () => {
    const layout = layoutTree([
      node('desk', 'base'),
      node('lamp', 'base', 'desk'),
      node('phone', 'tech'),
    ])

    const deepestBase = at(layout, 'lamp')?.row ?? 0
    const techBranch = at(layout, branchId('tech'))?.row ?? 0

    expect(techBranch).toBeGreaterThan(deepestBase)
  })

  /* A parent centred over its children is what makes it look drawn. */
  it('centres a parent over its outermost children', () => {
    const layout = layoutTree([
      node('desk', 'base'),
      node('lamp', 'base', 'desk'),
      node('mat', 'base', 'desk'),
    ])

    const lamp = at(layout, 'lamp')?.col ?? 0
    const mat = at(layout, 'mat')?.col ?? 0
    expect(at(layout, 'desk')?.col).toBe((Math.min(lamp, mat) + Math.max(lamp, mat)) / 2)
  })

  /*
   * The case that would go wrong silently. Gates are global, so "the
   * desk before the monitor arm" crosses branches — nesting it would
   * drag the arm out of Gadgets and into Home, and dropping the link
   * would leave a locked node with nothing explaining why.
   */
  it('keeps a cross-branch prerequisite on its own branch and draws the link separately', () => {
    const layout = layoutTree([node('desk', 'base'), node('arm', 'tech', 'desk')])

    /* One row under its own branch label, wherever that band starts. */
    expect(at(layout, 'arm')?.shelf).toBe('tech')
    expect(at(layout, 'arm')?.row).toBe((at(layout, branchId('tech'))?.row ?? 0) + 1)
    expect(layout.edges).toContainEqual({ from: branchId('tech'), to: 'arm', crossBranch: false })
    expect(layout.edges).toContainEqual({ from: 'desk', to: 'arm', crossBranch: true })
  })

  /*
   * A record pointing at an upgrade that no longer exists must still be
   * drawn. Degrading to a root is visible; being drawn nowhere is not.
   */
  it('treats a dangling prerequisite as a root rather than dropping the node', () => {
    const layout = layoutTree([node('lamp', 'base', 'gone')])

    expect(at(layout, 'lamp')?.row).toBe(2)
    expect(layout.edges).toContainEqual({ from: branchId('base'), to: 'lamp', crossBranch: false })
  })

  /*
   * An empty branch is a shelf you have not put anything on, which is
   * information — and a tree that grew branches as things were added
   * would rearrange itself under the reader.
   */
  it('draws a branch that has nothing on it', () => {
    const layout = layoutTree([node('desk', 'base')])

    expect(at(layout, branchId('tech'))).toBeDefined()
    expect(layout.edges).toContainEqual({
      from: TRUNK_ID,
      to: branchId('tech'),
      crossBranch: false,
    })
  })

  it('sorts the most wanted leftward within a branch', () => {
    const layout = layoutTree([
      node('low', 'base', undefined, 10),
      node('high', 'base', undefined, 90),
    ])

    expect(at(layout, 'high')?.col).toBeLessThan(at(layout, 'low')?.col ?? 0)
  })

  it('lays out an empty tree without inventing a node', () => {
    const layout = layoutTree([])

    expect(at(layout, TRUNK_ID)).toBeDefined()
    expect(layout.nodes.filter((one) => one.kind === 'upgrade')).toHaveLength(0)
  })
})
