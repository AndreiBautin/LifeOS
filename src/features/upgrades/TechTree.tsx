import { Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { TreeEntry } from '@/domain/upgrades/recommendation'
import { shelfOf, UPGRADE_SHELF_LABELS } from '@/domain/upgrades/shelf'
import { isOpen, isOwned } from '@/domain/upgrades/upgrade'

import { layoutTree, type LaidOutNode } from './tree-layout'

/**
 * The tech tree, drawn as a tree.
 *
 * Asked for as _"have the tech tree be an actual tree with the different
 * list we've made as literally branches of that tree instead like a
 * video game."_ It was a ranked list with a shelf toggle, which is a
 * perfectly good list and says nothing about what unlocks what.
 *
 * **SVG for the connectors, HTML for the nodes.** The lines need to run
 * between arbitrary points, which is what SVG is for; the nodes need to
 * be buttons with real text that wraps and a real tap target, which is
 * what HTML is for. Drawing the labels inside the SVG would mean
 * reimplementing text wrapping and losing the 44-pixel target the mobile
 * bar requires.
 *
 * **It shrinks to fit before it scrolls, and scrolling is now the last
 * resort rather than the design.** Reported as _"the tech tree still
 * needs to scroll which probably shouldn't happen on mobile either but
 * definitely not on desktop."_ Both halves are right: on a wide window
 * there is room for the whole tree and no reason to hide half of it
 * behind a gesture, and on a phone a tree one column too wide was
 * scrolling for the sake of a few pixels.
 *
 * So the canvas is measured against its container and scaled to fit —
 * down when it is too wide, and now **up too, within a cap**, when it
 * is narrower than the room it has. "Down only" was the rule for a
 * while, on the reasoning that blowing a small tree up to fill a
 * desktop would make three upgrades look like a skill web. Grown to
 * nine upgrades across two branches and still only drawing at roughly a
 * third of the available width, left-anchored with the rest as dead
 * space, is what that rule actually produced — reported directly:
 * "build out the tech tree more so that it fills the entire page
 * width." Content came first (see `seedTechTree`'s own doc) and was not
 * enough on its own; the tree's natural size is fixed by its node count
 * regardless of how wide the container is, so filling the width needed
 * the scale cap to move too.
 *
 * **`MAX_SCALE` is deliberately modest.** 1.4 turns a 116-pixel node
 * into 162 — bigger and easier to tap, not a poster. Filling literally
 * every pixel would mean scaling to whatever the widest window is,
 * which is exactly the "look like a skill web" outcome the original
 * rule was written to avoid; a cap keeps nodes a sane size and leaves
 * the canvas centred in whatever room is left over, rather than pinned
 * to the left edge the way the down-only version always was.
 *
 * **`MIN_SCALE` is what keeps the old argument alive on the small
 * side.** A tree of any width genuinely cannot be squeezed into 375
 * pixels with readable nodes, so below that floor it stops shrinking
 * and scrolls as it always did — the one place in this app where
 * sideways scrolling is correct. The page itself must never scroll
 * sideways, so the overflow stays on this container alone.
 *
 * **Drawn sideways, not top-down — depth runs right, siblings run
 * down.** Reported after the width fix landed: "no scroll on tech tree
 * still tho. maybe we could make it go horizontally?" Right, and the
 * two overflow axes were never symmetric here. `layoutTree` still
 * computes exactly what it always did — a `row` per depth level and
 * per branch-band, a `col` per sibling — the geometry never changed.
 * What changed is which pixel axis each one drives: `row` now drives
 * `x` and `col` now drives `y`, so the quantity that used to grow
 * without bound (every branch's chain, stacked one band under the
 * last) now grows the axis this container was already allowed to
 * scroll on, and the quantity that stayed small (how many siblings the
 * widest branch ever has at one level) now bounds the *page's* axis,
 * which must never scroll here.
 *
 * **There is no trunk any more.** Reported plainly: "doesn't really make
 * sense to have 'You' in the tech tree" — it stood for nothing the data
 * could name, and it was the entire reason branches had to stagger
 * across depth in the first place, to avoid drawing on top of a shared
 * root both of them connected to. Removing it let branches stack across
 * *columns* instead — see `tree-layout.ts`'s own doc — which is also
 * what retired the long structural edge a screenshot once read as "a
 * child of Espresso machine": that edge does not exist any more, because
 * nothing connects the branches to each other or to anything above them.
 * `longDistanceEdges` below still exists for prerequisite links that
 * genuinely span more than one depth step, which mostly no longer
 * happens either — two branches at nearly the same depth make the
 * ordinary S-curve between them close to a straight line through the
 * gap that already separates them.
 *
 * **Locked nodes are drawn, never hidden.** Seeing *why* the thing you
 * want is out of reach is the entire point of a tech tree; a view that
 * showed only what you could afford would be a shopping list.
 */

/**
 * Grid to pixels, sized for the rotated axes rather than the node's own
 * shape. `DEPTH_SPACING` is the *horizontal* gap between one depth level
 * and the next, so it has to clear a node's width plus room for the
 * curve; `SIBLING_SPACING` is the *vertical* gap between one sibling row
 * and the next, so it only has to clear a node's height.
 */
const DEPTH_SPACING = 176
const SIBLING_SPACING = 88
const NODE_WIDTH = 116
const NODE_HEIGHT = 64

/**
 * How small a node may get before scrolling is the better answer.
 *
 * At 0.7 a 116-pixel node is 81 and its label is around 8.5px — small,
 * still readable at arm's length, and the point past which shrinking
 * stops being a kindness. A tree that cannot fit at this scale scrolls.
 */
const MIN_SCALE = 0.7

/** How far a small tree may grow to use spare width. See the doc above. */
const MAX_SCALE = 1.4

/**
 * Extra canvas below every node, reserved for long-distance edges to
 * dip through — see `longDistanceEdges` in the component for which
 * edges that is and why it is not only prerequisite links.
 *
 * Reported directly, against a screenshot: "the overlap between base
 * and gadgets feels a bit weird" — and then, once the first fix missed
 * the real cause, "it seems like Gadgets is a child of Espresso machine
 * rather than a sibling of Base." Any edge that spans more than one
 * depth step is nearly a straight line for most of its length, which
 * cuts straight through whatever nodes happen to share its rough
 * height on the way.
 *
 * A dedicated detour fixes it rather than a sharper curve: the path
 * drops straight down from the source, runs along a lane below every
 * node on the canvas, and rises straight up into the target — so it
 * reads as a back-channel link rather than as a line that happens to
 * graze the tree it is crossing.
 */
const BOW_MARGIN = 40
/** Extra depth per additional long-distance edge, so two of them fan out rather than coincide. */
const BOW_LANE_GAP = 14

/*
 * `x` takes `row` and `y` takes `col` — the rotation is entirely in
 * which grid axis feeds which pixel axis. Nothing about `layoutTree`
 * itself changed: `row` is still depth-and-branch-band, `col` is still
 * sibling position, and this is the one place that decides depth reads
 * left-to-right instead of top-to-bottom.
 */
const x = (row: number): number => row * DEPTH_SPACING + DEPTH_SPACING / 2
const y = (col: number): number => col * SIBLING_SPACING + SIBLING_SPACING / 2

export function TechTree({
  entries,
  onPick,
}: {
  readonly entries: readonly TreeEntry[]
  readonly onPick: (id: string) => void
}) {
  const layout = layoutTree(
    entries.map((entry) => ({
      id: entry.upgrade.id,
      title: entry.upgrade.title,
      shelf: shelfOf(entry.upgrade),
      priority: entry.upgrade.priority,
      ...(entry.upgrade.prerequisiteId === undefined
        ? {}
        : { prerequisiteId: entry.upgrade.prerequisiteId }),
    })),
  )

  const byId = new Map(entries.map((entry) => [entry.upgrade.id as string, entry]))
  const positions = new Map(layout.nodes.map((node) => [node.id, node]))

  /*
   * **Every edge that skips more than one depth step detours through the
   * bow lane, not only prerequisite links.** Reported directly: "it
   * seems like Gadgets is a child of Espresso machine rather than a
   * sibling of Base." It was neither — that line is the trunk's own
   * ordinary edge to the *second* branch, which has to travel past the
   * first branch's entire subtree to get there. `crossBranch` alone
   * missed it, because a trunk-to-branch edge is not a prerequisite; it
   * is simply long, the same way a cross-branch prerequisite is long,
   * and the S-curve treats both identically regardless of *why* they
   * are far apart.
   *
   * Each one gets its own lane rather than sharing a single line at the
   * bottom, so two long edges dipping through the same stretch read as
   * two separate detours instead of merging into a new tangle of their
   * own.
   */
  const longDistanceEdges = layout.edges.filter((edge) => {
    const from = positions.get(edge.from)
    const to = positions.get(edge.to)
    return from !== undefined && to !== undefined && to.row - from.row > 1
  })
  const laneOf = new Map(
    longDistanceEdges.map((edge, index) => [`${edge.from}->${edge.to}`, index]),
  )

  /*
   * `rows` (depth-and-branch-bands) now drives width, `cols` (siblings)
   * now drives height — the swap that puts the unbounded quantity on
   * the axis this container is allowed to scroll, and the bounded one
   * on the axis the page never may.
   */
  const width = layout.rows * DEPTH_SPACING
  const height = layout.cols * SIBLING_SPACING

  /*
   * Measured on mount and on resize, from the element's own
   * `clientWidth` minus its padding.
   *
   * **`ResizeObserver` was the first build and is deliberately not used**
   * — it is the more precise tool and it does not fire in every context
   * an element can be laid out in, which makes the difference between
   * "fits" and "scrolls" depend on something invisible. The only thing
   * that changes this container's width is the window: the shell's cap
   * moves at `lg` and `xl`, and nothing else on the page resizes it. A
   * resize listener answers exactly that and can be tested by resizing.
   */
  const box = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState<number | undefined>(undefined)

  useEffect(() => {
    const measure = () => {
      const node = box.current
      if (node === null) return

      const padding = parseFloat(getComputedStyle(node).paddingInlineStart) * 2
      setAvailable(node.clientWidth - (Number.isFinite(padding) ? padding : 0))
    }

    measure()
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
    }
  }, [])

  /*
   * Scale to fit — down when the tree is wider than the room it has,
   * up to `MAX_SCALE` when it is narrower. Before the first measurement
   * this is 1, which draws the tree at its natural size for one frame —
   * the honest starting point, since guessing a scale would make the
   * tree jump on load either way.
   */
  const scale =
    available === undefined
      ? 1
      : width <= available
        ? Math.min(MAX_SCALE, available / width)
        : Math.max(MIN_SCALE, available / width)

  /*
   * **Centred only when it actually fits.** `justify-center` on an
   * `overflow-x-auto` flex row hides the *start* of an overflowing
   * child behind equal padding on both sides, so a tree still too wide
   * even at `MIN_SCALE` would need scrolling in both directions to see
   * either edge. That case keeps the old left-anchored, ordinary L-to-R
   * scroll; only a tree that fits within `available` gets centred in
   * the room it did not need.
   */
  const overflowing = available !== undefined && width * scale > available + 0.5

  /* Every node sits within `height`; the bow lanes are blank canvas below it. */
  const canvasHeight =
    height + BOW_MARGIN + Math.max(0, longDistanceEdges.length - 1) * BOW_LANE_GAP

  return (
    <div
      ref={box}
      className={`-mx-4 flex overflow-x-auto px-4 pb-2 ${overflowing ? '' : 'justify-center'}`}
    >
      {/*
        The scaled canvas keeps its own layout size, so the wrapper has to
        carry the *drawn* height or the page reserves room for a tree
        taller than the one on screen — a transform does not change what
        the box model thinks it occupies.
      */}
      <div style={{ height: canvasHeight * scale, width: width * scale }}>
        <div
          className="relative"
          style={{
            width,
            height: canvasHeight,
            transform: scale === 1 ? undefined : `scale(${String(scale)})`,
            transformOrigin: 'top left',
          }}
        >
          {/*
          `aria-hidden` because the lines carry no information a reader
          could act on — every node states its own lock and its own
          prerequisite in text, so the picture is the redundant half.
        */}
          <svg
            aria-hidden
            className="absolute inset-0"
            width={width}
            height={canvasHeight}
            viewBox={`0 0 ${String(width)} ${String(canvasHeight)}`}
          >
            {layout.edges.map((edge) => {
              const from = positions.get(edge.from)
              const to = positions.get(edge.to)
              if (from === undefined || to === undefined) return null

              const x1 = x(from.row) + NODE_WIDTH / 2
              const y1 = y(from.col)
              const x2 = x(to.row) - NODE_WIDTH / 2
              const y2 = y(to.col)

              /*
                **Long-distance edges detour through their own bow lane**
                rather than sharing the ordinary S-curve — see
                `longDistanceEdges` above and `BOW_MARGIN`.

                **The lane is a straight line at a fixed depth, not a
                single long curve that eases toward it.** A single bezier
                spanning the whole x1-to-x2 distance only *approaches*
                `bowY` gradually — reported directly, against a
                screenshot, "it still goes through standing desk." A node
                sitting close to the source end sits inside the stretch
                where the curve has not finished dropping yet, so a
                clearance that is generous once the curve is flat was not
                generous where the curve was still mid-turn. Two short
                curves (`TURN` wide, fixed regardless of the edge's own
                length) handle the drop and the rise; the long middle
                stretch is a plain horizontal line at exactly `bowY`,
                which is the one shape that cannot graze anything — its
                distance from every node is the same distance the lane
                itself was given.
              */
              const lane = laneOf.get(`${edge.from}->${edge.to}`)
              const bowY =
                lane === undefined ? undefined : height + BOW_MARGIN + lane * BOW_LANE_GAP
              const TURN = 24
              const path =
                bowY === undefined
                  ? `M ${String(x1)} ${String(y1)} C ${String((x1 + x2) / 2)} ${String(y1)}, ${String((x1 + x2) / 2)} ${String(y2)}, ${String(x2)} ${String(y2)}`
                  : `M ${String(x1)} ${String(y1)} C ${String(x1)} ${String(bowY)}, ${String(x1 + TURN)} ${String(bowY)}, ${String(x1 + TURN)} ${String(bowY)} L ${String(x2 - TURN)} ${String(bowY)} C ${String(x2 - TURN)} ${String(bowY)}, ${String(x2)} ${String(bowY)}, ${String(x2)} ${String(y2)}`

              /*
                **A path glows toward what it leads to, never decoratively.**
                "Give edges a subtle glow" landed here rather than on the
                nodes: several nodes are legitimately affordable at once,
                which already earns them the accent tint it always has, and
                stacking a glow on every one of them would be the thing this
                app's own buttons are deliberately restrained about — a glow
                is for the one thing pressed, not for a whole tree lighting
                up at once. An edge is singular by construction, one for
                each step, so it can say "this step is already paid for" or
                "this step is open to you" without making the same claim
                more than once.
              */
              const targetEntry = to.upgradeId === undefined ? undefined : byId.get(to.upgradeId)
              const targetOwned = targetEntry !== undefined && isOwned(targetEntry.upgrade)
              const targetOpen = targetEntry !== undefined && isOpen(targetEntry.upgrade)
              const targetReachable =
                targetEntry !== undefined && !targetOwned && targetOpen && targetEntry.affordable
              const tint = targetOwned
                ? 'var(--color-good-500)'
                : targetReachable
                  ? 'var(--color-accent-500)'
                  : undefined

              return (
                <g key={`${edge.from}->${edge.to}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={tint ?? 'currentColor'}
                    strokeWidth={edge.crossBranch ? 1 : tint === undefined ? 1.5 : 2}
                    strokeDasharray={edge.crossBranch ? '3 3' : undefined}
                    className={
                      tint !== undefined
                        ? undefined
                        : edge.crossBranch
                          ? 'text-ink-700'
                          : 'text-ink-800'
                    }
                    style={
                      tint === undefined ? undefined : { filter: `drop-shadow(0 0 3px ${tint})` }
                    }
                  />
                  {/*
                  **Light running along a lit edge, toward what it leads
                  to.** Only on the edges already tinted — owned or open
                  to you — so the motion says the same thing the colour
                  does and nothing more. It flows rather than pulses: the
                  portrait's pulsing rings were rejected as blinking, and
                  a dash travelling one way never changes brightness.
                */}
                  {tint !== undefined && (
                    <path
                      d={path}
                      fill="none"
                      stroke={tint}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      className="edge-flow"
                      style={{ filter: `drop-shadow(0 0 4px ${tint})` }}
                    />
                  )}
                </g>
              )
            })}
          </svg>

          {layout.nodes.map((node) => (
            <TreeNodeBox
              key={node.id}
              node={node}
              entry={node.upgradeId === undefined ? undefined : byId.get(node.upgradeId)}
              onPick={onPick}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function TreeNodeBox({
  node,
  entry,
  onPick,
}: {
  readonly node: LaidOutNode
  readonly entry: TreeEntry | undefined
  readonly onPick: (id: string) => void
}) {
  const style = {
    left: x(node.row) - NODE_WIDTH / 2,
    top: y(node.col) - NODE_HEIGHT / 2,
    width: NODE_WIDTH,
    minHeight: NODE_HEIGHT,
  }

  if (node.kind === 'branch') {
    return (
      <div
        className="control-surface rounded-lg [--control-tint:var(--color-ink-500)] text-ink-100 absolute grid place-items-center px-2 text-center text-sm font-semibold"
        style={{ ...style, minHeight: 44, height: 44, top: y(node.col) - 22 }}
      >
        {node.shelf === undefined ? node.label : UPGRADE_SHELF_LABELS[node.shelf]}
      </div>
    )
  }

  if (entry === undefined) return null

  const owned = isOwned(entry.upgrade)
  /*
   * **A dropped node is drawn and must never be drawn as reachable.**
   * The lists below fold owned and dropped away behind the eye, and the
   * picture did not — so an upgrade you had decided against came out
   * accented, which on this screen means *the thing you can act on*.
   * That is the defect the lists were already fixed for, surviving one
   * layer up in the drawing: the tech tree recommending something you
   * had said no to.
   *
   * It stays **drawn** rather than filtered, for the reason a locked
   * node is: it may be somebody else's prerequisite, and removing it
   * would leave a locked node with nothing on screen explaining why.
   */
  const dropped = !owned && !isOpen(entry.upgrade)
  const locked = entry.gates.length > 0

  /*
   * Four states, each different at a glance, which is what a tech tree
   * is for: owned is filled and quiet, dropped is struck through and
   * quieter still, reachable is accented because it is the thing you
   * can act on, and locked is dimmed with its reason on the node.
   */
  const tone = owned
    ? 'control-surface rounded-lg [--control-tint:var(--color-good-500)] text-ink-100'
    : dropped
      ? 'control-surface rounded-lg [--control-tint:var(--color-ink-500)] text-ink-700'
      : entry.affordable
        ? 'control-surface rounded-lg [--control-tint:var(--color-accent-500)] text-ink-50'
        : 'control-surface rounded-lg [--control-tint:var(--color-ink-500)] text-ink-500'

  return (
    <button
      type="button"
      onClick={() => {
        onPick(entry.upgrade.id)
      }}
      style={
        {
          ...style,
          /* Nodes arrive root first, one depth at a time. */
          '--node-delay': `${String(node.row * 90)}ms`,
          /* The node you can act on carries a soft light of its own. */
          ...(!owned && !dropped && entry.affordable
            ? {
                boxShadow:
                  'inset 0 1px 0 0 var(--card-sheen), 0 0 22px -4px color-mix(in oklab, var(--color-accent-500) 55%, transparent)',
              }
            : {}),
        } as React.CSSProperties
      }
      className={`tap-target tree-node-in absolute flex flex-col justify-center gap-0.5 px-2 py-1.5 text-center ${tone} ${locked && !owned && !dropped ? 'opacity-75' : ''}`}
    >
      <span
        className={`text-xs leading-tight font-medium break-words ${dropped ? 'line-through' : ''}`}
      >
        {entry.upgrade.title}
      </span>

      {owned ? (
        <span className="text-good-500 text-[10px]">Owned</span>
      ) : dropped ? (
        <span className="text-ink-700 text-[10px]">Dropped</span>
      ) : null}

      {locked && !owned && !dropped && (
        <span className="text-ink-600 flex items-center justify-center gap-1 text-[10px]">
          <Lock size={9} aria-hidden />
          {/*
            A prerequisite outranks a shortfall in the label, because it
            is the one you cannot fix with money — and a node that says
            "short" when it is really waiting on another purchase sends
            you to the wrong problem.
          */}
          Locked
        </span>
      )}
    </button>
  )
}
