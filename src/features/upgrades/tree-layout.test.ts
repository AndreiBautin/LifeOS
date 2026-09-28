import { describe, expect, it } from 'vitest'

import { branchId, layoutTree, type LayoutInput } from './tree-layout'

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
  it('starts every branch label at row 0 and its own roots at row 1', () => {
    const layout = layoutTree([node('desk', 'base'), node('phone', 'tech')])

    expect(at(layout, branchId('base'))?.row).toBe(0)
    expect(at(layout, 'desk')?.row).toBe(1)
    expect(at(layout, branchId('tech'))?.row).toBe(0)
    expect(at(layout, 'phone')?.row).toBe(1)
  })

  /*
   * The component reads a branch node's own `shelf` to look up its
   * pretty label — without it, a shipped regression fell back to the
   * raw id, showing "base" and "tech" instead of "Base" and "Gadgets".
   */
  it('carries the shelf on the branch node itself, not only on its upgrades', () => {
    const layout = layoutTree([node('desk', 'base')])

    expect(at(layout, branchId('base'))?.shelf).toBe('base')
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

    expect(at(layout, 'desk')?.row).toBe(1)
    expect(at(layout, 'lamp')?.row).toBe(2)
    expect(at(layout, 'bulb')?.row).toBe(3)
    expect(layout.rows).toBeGreaterThan(at(layout, 'bulb')?.row ?? 0)
  })

  /*
   * **The height is every branch stacked, not just the widest one.**
   * With no shared trunk to avoid overlapping, branches no longer stagger
   * across depth to keep clear of each other — they stack across columns
   * instead, so two branches of three roots each come out needing seven:
   * three, a gap, three.
   */
  it('sizes the canvas to every branch stacked, with a gap between them', () => {
    const layout = layoutTree([
      node('a', 'base'),
      node('b', 'base'),
      node('c', 'base'),
      node('x', 'tech'),
      node('y', 'tech'),
      node('z', 'tech'),
    ])

    expect(layout.cols).toBe(7)
  })

  /* And a branch's own column band cannot overlap the one before it. */
  it('gives each branch a column band of its own', () => {
    const layout = layoutTree([
      node('desk', 'base'),
      node('lamp', 'base', 'desk'),
      node('phone', 'tech'),
    ])

    const baseCols = layout.nodes.filter((one) => one.shelf === 'base').map((one) => one.col)
    const techBranchCol = at(layout, branchId('tech'))?.col ?? 0

    expect(techBranchCol).toBeGreaterThan(Math.max(...baseCols))
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

    /* One row under its own branch label, same as any other root. */
    expect(at(layout, 'arm')?.shelf).toBe('tech')
    expect(at(layout, 'arm')?.row).toBe(1)
    expect(layout.edges).toContainEqual({ from: branchId('tech'), to: 'arm', crossBranch: false })
    expect(layout.edges).toContainEqual({ from: 'desk', to: 'arm', crossBranch: true })
  })

  /*
   * A record pointing at an upgrade that no longer exists must still be
   * drawn. Degrading to a root is visible; being drawn nowhere is not.
   */
  it('treats a dangling prerequisite as a root rather than dropping the node', () => {
    const layout = layoutTree([node('lamp', 'base', 'gone')])

    expect(at(layout, 'lamp')?.row).toBe(1)
    expect(layout.edges).toContainEqual({ from: branchId('base'), to: 'lamp', crossBranch: false })
  })

  /*
   * An empty branch is a shelf you have not put anything on, which is
   * information — and a tree that grew branches as things were added
   * would rearrange itself under the reader.
   */
  it('draws a branch that has nothing on it', () => {
    const layout = layoutTree([node('desk', 'base')])

    const tech = at(layout, branchId('tech'))
    expect(tech).toBeDefined()
    /* Nothing points at a branch — branches are roots now, not children of anything. */
    expect(layout.edges.some((edge) => edge.to === branchId('tech'))).toBe(false)
  })

  it('sorts the most wanted leftward within a branch', () => {
    const layout = layoutTree([
      node('low', 'base', undefined, 10),
      node('high', 'base', undefined, 90),
    ])

    expect(at(layout, 'high')?.col).toBeLessThan(at(layout, 'low')?.col ?? 0)
  })

  it('lays out an empty tree as branches with nothing under them', () => {
    const layout = layoutTree([])

    expect(layout.nodes.filter((one) => one.kind === 'upgrade')).toHaveLength(0)
    expect(layout.nodes.every((one) => one.kind === 'branch')).toBe(true)
    expect(layout.nodes.length).toBeGreaterThan(0)
  })
})
