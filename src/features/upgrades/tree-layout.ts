import { UPGRADE_SHELVES, type UpgradeShelf } from '@/domain/upgrades/upgrade'

/**
 * Where each node of the tech tree sits, as a grid of columns and rows.
 *
 * Asked for as _"instead of the tech tree being one thing, I want that
 * to be renamed to gadgets and just have the tech tree be an actual tree
 * with the different list we've made (home, tech, etc) as literally
 * branches of that tree instead like a video game."_
 *
 * **Pure, and in the feature rather than the domain.** It is geometry
 * over a graph, so it can be tested without a browser — but positions
 * are a presentation concern and `domain/upgrades/` has no business
 * holding an opinion about where a box is drawn. The domain owns the
 * gates and the ranking; this owns the picture of them.
 *
 * **Columns are fractional on purpose.** A parent sits at the midpoint
 * of its outermost children, which is what makes a tidy tree look drawn
 * rather than stacked, and the midpoint of two integer columns is a
 * half. The component multiplies by a pixel constant, so nothing here
 * needs to know how wide a node is.
 */
export interface LayoutInput {
  readonly id: string
  readonly title: string
  readonly shelf: UpgradeShelf
  readonly prerequisiteId?: string | undefined
  /** Higher sorts leftward, so the tree reads most-wanted first. */
  readonly priority: number
}

export type NodeKind = 'trunk' | 'branch' | 'upgrade'

export interface LaidOutNode {
  /** `trunk`, `shelf:<shelf>`, or the upgrade's own id. */
  readonly id: string
  readonly kind: NodeKind
  readonly label: string
  readonly col: number
  readonly row: number
  readonly shelf?: UpgradeShelf
  /** Present only on an upgrade node, for joining back to the record. */
  readonly upgradeId?: string
}

export interface LaidOutEdge {
  readonly from: string
  readonly to: string
  /**
   * A prerequisite sitting on another branch.
   *
   * **Gates are global and ranking is per shelf** — "the desk before the
   * monitor arm" is a real dependency that crosses branches — so the
   * layout cannot simply nest such a node under its prerequisite without
   * pulling it out of its own branch. It is laid out as a root of its
   * own branch and the dependency is drawn as a separate edge, which the
   * component dashes. Hiding it would make a locked node look unexplained.
   */
  readonly crossBranch: boolean
}

export interface TreeLayout {
  readonly nodes: readonly LaidOutNode[]
  readonly edges: readonly LaidOutEdge[]
  /** Grid extent, so a caller can size the canvas without measuring. */
  readonly cols: number
  readonly rows: number
}

/** Empty columns left between one branch and the next. */
const BRANCH_GUTTER = 1

export const TRUNK_ID = 'trunk'
export const branchId = (shelf: UpgradeShelf): string => `shelf:${shelf}`

/**
 * Lays the whole tree out: a trunk, a branch per shelf, and each shelf's
 * upgrades nested by prerequisite beneath it.
 *
 * Rows are fixed by kind — trunk 0, branches 1, upgrades 2 and down —
 * so every branch label sits on one line however deep its chains run.
 */
export function layoutTree(
  upgrades: readonly LayoutInput[],
  shelves: readonly UpgradeShelf[] = UPGRADE_SHELVES,
): TreeLayout {
  const byId = new Map(upgrades.map((one) => [one.id, one]))
  const nodes: LaidOutNode[] = []
  const edges: LaidOutEdge[] = []

  /*
   * A prerequisite counts for nesting only when it exists and sits on
   * the same branch. Anything else — a dangling id, or a parent on
   * another branch — makes this a root, so a broken record degrades to a
   * node drawn at the top of its branch rather than one drawn nowhere.
   */
  const nestsUnder = (one: LayoutInput): string | undefined => {
    if (one.prerequisiteId === undefined) return undefined
    const parent = byId.get(one.prerequisiteId)
    if (parent?.shelf !== one.shelf) return undefined
    return parent.id
  }

  const children = new Map<string, LayoutInput[]>()
  for (const one of upgrades) {
    const parent = nestsUnder(one)
    if (parent === undefined) continue
    children.set(parent, [...(children.get(parent) ?? []), one])
  }

  const ordered = (list: readonly LayoutInput[]): readonly LayoutInput[] =>
    [...list].sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title))

  let nextCol = 0
  let deepestRow = 1

  const place = (one: LayoutInput, row: number): number => {
    const kids = ordered(children.get(one.id) ?? [])
    let col: number

    if (kids.length === 0) {
      col = nextCol
      nextCol += 1
    } else {
      const cols = kids.map((kid) => place(kid, row + 1))
      col = (Math.min(...cols) + Math.max(...cols)) / 2
    }

    deepestRow = Math.max(deepestRow, row)
    nodes.push({
      id: one.id,
      kind: 'upgrade',
      label: one.title,
      col,
      row,
      shelf: one.shelf,
      upgradeId: one.id,
    })

    for (const kid of kids) edges.push({ from: one.id, to: kid.id, crossBranch: false })

    return col
  }

  const branchCols: number[] = []

  for (const shelf of shelves) {
    const roots = ordered(
      upgrades.filter((one) => one.shelf === shelf && nestsUnder(one) === undefined),
    )

    /*
     * A branch with nothing on it still gets drawn. An empty branch is a
     * shelf you have not put anything on, which is information — and a
     * tree whose branches appear only once populated would rearrange
     * itself as things were added.
     */
    const cols = roots.map((root) => place(root, 2))
    const col = cols.length === 0 ? nextCol++ : (Math.min(...cols) + Math.max(...cols)) / 2

    /*
     * **A gutter between branches, because without one they read as one
     * branch.** Columns are handed out in a single running sequence, so
     * the last node of Base and the first of Gadgets sat adjacent with
     * nothing between them — and since a connector runs up and off the
     * top of a node, a reader had to trace a line to the branch label to
     * tell which side something was on. Seen immediately on the first
     * tree with content on both branches: a Monitor filed under Gadgets
     * appeared to hang off Base.
     */
    nextCol += BRANCH_GUTTER

    branchCols.push(col)
    nodes.push({ id: branchId(shelf), kind: 'branch', label: shelf, col, row: 1, shelf })

    edges.push({ from: TRUNK_ID, to: branchId(shelf), crossBranch: false })
    for (const root of roots) edges.push({ from: branchId(shelf), to: root.id, crossBranch: false })
  }

  /* Cross-branch prerequisites, drawn as their own edges — see `crossBranch`. */
  for (const one of upgrades) {
    if (one.prerequisiteId === undefined) continue
    const parent = byId.get(one.prerequisiteId)
    if (parent === undefined || parent.shelf === one.shelf) continue
    edges.push({ from: parent.id, to: one.id, crossBranch: true })
  }

  nodes.push({
    id: TRUNK_ID,
    kind: 'trunk',
    label: 'You',
    col: branchCols.length === 0 ? 0 : (Math.min(...branchCols) + Math.max(...branchCols)) / 2,
    row: 0,
  })

  return { nodes, edges, cols: Math.max(nextCol, 1), rows: deepestRow + 1 }
}
