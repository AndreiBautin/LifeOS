import { Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { TreeEntry } from '@/domain/upgrades/recommendation'
import { shelfOf, UPGRADE_SHELF_LABELS } from '@/domain/upgrades/shelf'
import { formatMinorUnits, isOwned } from '@/domain/upgrades/upgrade'

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
 * So the canvas is measured against its container and scaled down to
 * fit. **Down only** — a small tree is never blown up to fill a desktop,
 * which would make three upgrades look like a skill web.
 *
 * **`MIN_SCALE` is what keeps the old argument alive.** A tree of any
 * width genuinely cannot be squeezed into 375 pixels with readable
 * nodes, so below that floor it stops shrinking and scrolls as it always
 * did — the one place in this app where sideways scrolling is correct.
 * The page itself must never scroll sideways, so the overflow stays on
 * this container alone.
 *
 * **Locked nodes are drawn, never hidden.** Seeing *why* the thing you
 * want is out of reach is the entire point of a tech tree; a view that
 * showed only what you could afford would be a shopping list.
 */

/** Grid to pixels. Wide enough for a node, tall enough for a label to wrap. */
const COL_WIDTH = 132
const ROW_HEIGHT = 96
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

const x = (col: number): number => col * COL_WIDTH + COL_WIDTH / 2
const y = (row: number): number => row * ROW_HEIGHT + ROW_HEIGHT / 2

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

  const width = layout.cols * COL_WIDTH
  const height = layout.rows * ROW_HEIGHT

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
   * Scale down to fit and never up. Before the first measurement this is
   * 1, which draws the tree at full size for one frame — the honest
   * starting point, since guessing a scale would make a narrow tree jump
   * on load.
   */
  const scale =
    available === undefined || width <= available ? 1 : Math.max(MIN_SCALE, available / width)

  return (
    <div ref={box} className="-mx-4 overflow-x-auto px-4 pb-2">
      {/*
        The scaled canvas keeps its own layout size, so the wrapper has to
        carry the *drawn* height or the page reserves room for a tree
        taller than the one on screen — a transform does not change what
        the box model thinks it occupies.
      */}
      <div style={{ height: height * scale, width: width * scale }}>
        <div
          className="relative"
          style={{
            width,
            height,
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
            height={height}
            viewBox={`0 0 ${String(width)} ${String(height)}`}
          >
            {layout.edges.map((edge) => {
              const from = positions.get(edge.from)
              const to = positions.get(edge.to)
              if (from === undefined || to === undefined) return null

              const x1 = x(from.col)
              const y1 = y(from.row) + NODE_HEIGHT / 2
              const x2 = x(to.col)
              const y2 = y(to.row) - NODE_HEIGHT / 2
              const mid = (y1 + y2) / 2

              return (
                <path
                  key={`${edge.from}->${edge.to}`}
                  d={`M ${String(x1)} ${String(y1)} C ${String(x1)} ${String(mid)}, ${String(x2)} ${String(mid)}, ${String(x2)} ${String(y2)}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={edge.crossBranch ? 1 : 1.5}
                  strokeDasharray={edge.crossBranch ? '3 3' : undefined}
                  className={edge.crossBranch ? 'text-ink-700' : 'text-ink-800'}
                />
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
    left: x(node.col) - NODE_WIDTH / 2,
    top: y(node.row) - NODE_HEIGHT / 2,
    width: NODE_WIDTH,
    minHeight: NODE_HEIGHT,
  }

  if (node.kind === 'trunk') {
    return (
      <div
        className="border-accent-500/40 bg-accent-500/10 text-accent-300 absolute grid place-items-center rounded-full border text-sm font-semibold"
        style={{ ...style, minHeight: 44, height: 44, top: y(node.row) - 22 }}
      >
        {node.label}
      </div>
    )
  }

  if (node.kind === 'branch') {
    return (
      <div
        className="border-ink-700 bg-ink-850 text-ink-100 absolute grid place-items-center rounded-lg border px-2 text-center text-sm font-semibold"
        style={{ ...style, minHeight: 44, height: 44, top: y(node.row) - 22 }}
      >
        {node.shelf === undefined ? node.label : UPGRADE_SHELF_LABELS[node.shelf]}
      </div>
    )
  }

  if (entry === undefined) return null

  const owned = isOwned(entry.upgrade)
  const locked = entry.gates.length > 0

  /*
   * Three states and each looks different at a glance, which is what a
   * tech tree is for: owned is filled and quiet, reachable is accented
   * because it is the thing you can act on, and locked is dimmed with
   * its reason on the node.
   */
  const tone = owned
    ? 'border-good-500/40 bg-good-500/10 text-ink-100'
    : entry.affordable
      ? 'border-accent-500/50 bg-accent-500/10 text-ink-50'
      : 'border-ink-800 bg-ink-900 text-ink-500'

  return (
    <button
      type="button"
      onClick={() => {
        onPick(entry.upgrade.id)
      }}
      style={style}
      className={`tap-target absolute flex flex-col justify-center gap-0.5 rounded-lg border px-2 py-1.5 text-center ${tone}`}
    >
      <span className="text-xs leading-tight font-medium break-words">{entry.upgrade.title}</span>

      {owned ? (
        <span className="text-good-500 text-[10px]">Owned</span>
      ) : (
        <span className="numeric text-[10px] opacity-80">
          {entry.upgrade.estimatedCostMinorUnits === undefined
            ? '—'
            : formatMinorUnits(entry.upgrade.estimatedCostMinorUnits)}
        </span>
      )}

      {locked && !owned && (
        <span className="text-ink-600 flex items-center justify-center gap-1 text-[10px]">
          <Lock size={9} aria-hidden />
          {/*
            A prerequisite outranks a shortfall in the label, because it
            is the one you cannot fix with money — and a node that says
            "short" when it is really waiting on another purchase sends
            you to the wrong problem.
          */}
          {entry.gates.some((gate) => gate.kind === 'prerequisite') ? 'Locked' : 'Short'}
        </span>
      )}
    </button>
  )
}
