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
 *
 * **There is no trunk any more, and removing it is what let the branches
 * stop staggering.** Reported plainly: "doesn't really make sense to
 * have 'You' in the tech tree." It never stood for anything the data
 * could name — it was a picture of the *account*, drawn as a node, and
 * every branch had to connect to it somehow.
 *
 * That single requirement — a shared root every branch must reach — is
 * the entire reason branches used to stagger across *depth* instead of
 * sitting side by side: with one shared starting point, two branches at
 * the same depth would draw on top of each other, so each branch's own
 * band started only after the previous branch's deepest chain finished.
 * That is also, precisely, what made a structural trunk-to-second-branch
 * edge have to travel the width of the first branch's entire subtree to
 * reach it — the edge a screenshot later called "a child of Espresso
 * machine" for exactly that reason.
 *
 * With no shared root, branches do not need to avoid each other in
 * depth at all. They now stack in the *other* axis — each starts fresh
 * at its own row 1, and it is columns that accumulate from one branch to
 * the next, the same job rows used to do. A prerequisite that crosses
 * branches is the only edge left with real distance to cover, and it
 * covers it directly: two branches side by side share almost the same
 * depth, so the edge between them is close to a straight vertical line
 * through the gap that already separates the branches, rather than a
 * detour around anything.
 *
 * **Branches stack rather than sitting in one running sequence, and
 * that is the whole of what makes this usable on a phone.** Reported as
 * _"I have to scroll all the way over to see it in mobile which isn't a
 * great experience."_ Columns used to be handed out in one running
 * sequence across every branch too, before rows took over that job for a
 * while — the effect is the same either way: two branches of three
 * upgrades each come out needing seven columns' worth of canvas rather
 * than the three either one alone would need, and that is deliberate.
 * After the tree rotated to read sideways, that total drives the
 * canvas's *height*, which this screen keeps small on purpose — but the
 * cost of two branches instead of one showing on it plainly is a couple
 * of extra rows, not a redesign.
 */
export interface LayoutInput {
  readonly id: string
  readonly title: string
  readonly shelf: UpgradeShelf
  readonly prerequisiteId?: string | undefined
  /** Higher sorts leftward, so the tree reads most-wanted first. */
  readonly priority: number
  /** Siblings sharing one are drawn under a node of that name. */
  readonly group?: string | undefined
}

export type NodeKind = 'branch' | 'group' | 'upgrade'

export interface LaidOutNode {
  /** `shelf:<shelf>`, or the upgrade's own id. */
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

/**
 * Empty columns left between one branch's band and the next.
 *
 * The column axis is what separates branches now that they stack side
 * by side rather than one after another in depth — without a gap, the
 * last root of one branch and the first root of the next would sit
 * adjacent with nothing between them, the same "a Monitor filed under
 * Gadgets appeared to hang off Base" failure this file has already
 * named once, on the axis that mattered before the tree rotated.
 */
const BRANCH_GAP = 1

export const branchId = (shelf: UpgradeShelf): string => `shelf:${shelf}`

/**
 * Lays the whole tree out: a branch per shelf, stacked side by side, and
 * each shelf's upgrades nested by prerequisite beside it.
 *
 * Every branch's own roots sit one row below its own label — row 0 is
 * the label, row 1 is where its roots start — because there is no
 * shared trunk above them to offset from any more. What used to stagger
 * branches across rows to keep them from overlapping a trunk now
 * stacks them across columns instead, which is the axis a second branch
 * actually needs of its own.
 */
export function layoutTree(
  input: readonly LayoutInput[],
  shelves: readonly UpgradeShelf[] = UPGRADE_SHELVES,
): TreeLayout {
  /*
   * **Groups become nodes of their own, then the tree is laid out as
   * before.** An upgrade with a group and no same-branch prerequisite is
   * re-parented onto a synthetic node named for the group, so "Apple"
   * sits between Gadgets and both Apple items. One nested under a real
   * prerequisite stays there: a gate is a stronger statement than a
   * label, and moving it would hide why it is locked.
   */
  const original = new Map(input.map((one) => [one.id, one]))
  const groups = new Map<string, LayoutInput>()
  const regrouped = input.map((one) => {
    const name = one.group?.trim() ?? ''
    if (name === '') return one
    const parent = one.prerequisiteId === undefined ? undefined : original.get(one.prerequisiteId)
    if (parent?.shelf === one.shelf) return one
    const id = `group:${one.shelf}:${name.toLowerCase()}`
    const seen = groups.get(id)
    groups.set(id, {
      id,
      title: seen?.title ?? name,
      shelf: one.shelf,
      priority: Math.max(seen?.priority ?? 0, one.priority),
    })
    return { ...one, prerequisiteId: id }
  })
  const upgrades = [...regrouped, ...groups.values()]

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
    nodes.push(
      groups.has(one.id)
        ? { id: one.id, kind: 'group', label: one.title, col, row }
        : {
            id: one.id,
            kind: 'upgrade',
            label: one.title,
            col,
            row,
            shelf: one.shelf,
            upgradeId: one.id,
          },
    )

    for (const kid of kids) edges.push({ from: one.id, to: kid.id, crossBranch: false })

    return col
  }

  /** The deepest any single branch's own chain reached. */
  let deepestAnyRow = 1

  for (const shelf of shelves) {
    const roots = ordered(
      upgrades.filter((one) => one.shelf === shelf && nestsUnder(one) === undefined),
    )

    /*
     * Every branch's roots start at row 1 — there is no trunk above them
     * to offset from any more — so depth resets per branch while columns
     * do not: columns are what stack one branch under the last now, the
     * job rows used to do while a shared root meant branches had to
     * avoid overlapping it in depth instead.
     */
    deepestRow = 1

    /*
     * A branch with nothing on it still gets drawn. An empty branch is a
     * shelf you have not put anything on, which is information — and a
     * tree whose branches appeared only once populated would rearrange
     * itself as things were added.
     */
    const cols = roots.map((root) => place(root, 1))
    const col = cols.length === 0 ? nextCol++ : (Math.min(...cols) + Math.max(...cols)) / 2

    deepestAnyRow = Math.max(deepestAnyRow, deepestRow)

    nodes.push({ id: branchId(shelf), kind: 'branch', label: shelf, col, row: 0, shelf })

    for (const root of roots) edges.push({ from: branchId(shelf), to: root.id, crossBranch: false })

    nextCol += BRANCH_GAP
  }

  /* Cross-branch prerequisites, drawn as their own edges — see `crossBranch`. */
  for (const one of input) {
    if (one.prerequisiteId === undefined) continue
    const parent = byId.get(one.prerequisiteId)
    if (parent === undefined || parent.shelf === one.shelf) continue
    edges.push({ from: parent.id, to: one.id, crossBranch: true })
  }

  return {
    nodes,
    edges,
    /* `nextCol` has already stepped past the last branch's own trailing gap. */
    cols: Math.max(nextCol - BRANCH_GAP, 1),
    rows: Math.max(deepestAnyRow + 1, 1),
  }
}
