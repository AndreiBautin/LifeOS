import { Network } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardHeading } from '@/components/shared/primitives'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/shared/styles'
import type { Gate } from '@/domain/game/tree'
import type { TreeEntry } from '@/domain/upgrades/recommendation'
import { shelfOf, UPGRADE_SHELVES } from '@/domain/upgrades/shelf'
import { isOpen, isOwned } from '@/domain/upgrades/upgrade'

import { useWholeTree } from './hooks'

/**
 * The tech tree, at a glance — see `BaseGlance` for why this exists.
 *
 * **The highest-priority entry still worth wanting, not the whole
 * tree.** `wholeTree` already returns every entry ranked — effective
 * priority, own priority, then by name — so "next" is just
 * the first one that is neither owned nor dropped.
 *
 * **No savings gauge, because nothing is saved.** It drew a thermometer
 * of the banked pool against the price, and the pool went with finance
 * tracking — reported as _"we aren't tracking how much we have saved or
 * anything anymore, remember?"_ A tube sitting at 0% forever over
 * "Nothing banked" was the card describing a feature that no longer
 * exists. What is left is a reading the tree actually holds: how much of
 * the list you already own.
 *
 * **Drawn as a tree, because it is one.** It was a number over a grid of
 * squares, which sat directly under Base's number over a grid of dots and
 * read as the same widget twice. This is the screen's own shape in
 * miniature: a trunk, a branch per shelf, a leaf per item — lit once it
 * is owned — so the card looks like what it opens.
 */
const TREE_WIDTH = 56
const TREE_HEIGHT = 40
const LEAVES_PER_BRANCH = 5

function OwnedTree({ entries }: { readonly entries: readonly TreeEntry[] }) {
  const listed = entries.filter((entry) => entry.upgrade.status !== 'cancelled')
  const owned = listed.filter((entry) => isOwned(entry.upgrade)).length
  const branches = UPGRADE_SHELVES.map((shelf) =>
    listed.filter((entry) => shelfOf(entry.upgrade) === shelf).slice(0, LEAVES_PER_BRANCH),
  ).filter((leaves) => leaves.length > 0)

  const root = { x: TREE_WIDTH / 2, y: 4 }
  /*
   * Every leaf gets an equal slot across the full width, and a branch sits
   * over the middle of its own leaves. Spacing branches evenly instead put
   * five Gadgets leaves into the same width as three Base ones, and they
   * touched.
   */
  const slot =
    TREE_WIDTH /
    Math.max(
      1,
      branches.reduce((sum, leaves) => sum + leaves.length, 0),
    )
  const starts = branches.map((_, index) =>
    branches.slice(0, index).reduce((sum, leaves) => sum + leaves.length, 0),
  )

  return (
    <div
      role="img"
      aria-label={`${String(owned)} of ${String(listed.length)} upgrades owned`}
      className="hidden w-14 shrink-0 flex-col items-center gap-1 lg:flex"
    >
      <span className="numeric text-ink-100 text-xs leading-none font-semibold">
        {owned}/{listed.length}
      </span>
      <span className="text-ink-500 text-[10px] leading-none">owned</span>
      <svg
        width={TREE_WIDTH}
        height={TREE_HEIGHT}
        viewBox={`0 0 ${String(TREE_WIDTH)} ${String(TREE_HEIGHT)}`}
        aria-hidden
      >
        {branches.map((leaves, branch) => {
          const first = (starts[branch] ?? 0) * slot
          const node = { x: first + (leaves.length * slot) / 2, y: 17 }
          return (
            <g key={branch}>
              <line
                x1={root.x}
                y1={root.y}
                x2={node.x}
                y2={node.y}
                stroke="var(--color-ink-700)"
                strokeWidth={1}
              />
              {leaves.map((entry, index) => {
                const x = first + slot * (index + 0.5)
                const lit = isOwned(entry.upgrade)
                return (
                  <g key={entry.upgrade.id}>
                    <line
                      x1={node.x}
                      y1={node.y}
                      x2={x}
                      y2={33}
                      stroke="var(--color-ink-700)"
                      strokeWidth={1}
                    />
                    <circle
                      cx={x}
                      cy={34}
                      r={2}
                      fill={lit ? 'var(--color-accent-500)' : 'var(--color-ink-800)'}
                      stroke={lit ? 'none' : 'var(--color-ink-600)'}
                      strokeWidth={0.8}
                    />
                  </g>
                )
              })}
              <circle cx={node.x} cy={node.y} r={2} fill="var(--color-ink-500)" />
            </g>
          )
        })}
        <circle cx={root.x} cy={root.y} r={2.4} fill="var(--color-accent-500)" />
      </svg>
    </div>
  )
}

/**
 * The prerequisite still to buy, said plainly — or nothing at all.
 *
 * It read "unlocked" when nothing was in the way, and the report was
 * simply _"what does this mean?"_ A word that only makes sense once you
 * know the tree's vocabulary is noise on a card meant to be glanced at;
 * the absence of a blocker needs no announcement.
 */
function blocker(gates: readonly Gate[]): string | undefined {
  const prerequisite = gates.find((gate) => gate.kind === 'prerequisite')
  return prerequisite === undefined ? undefined : `Needs ${prerequisite.title} first`
}

export function NextUpgradeGlance() {
  const tree = useWholeTree()

  if (tree.data === undefined) {
    return (
      <Card>
        <Skeleton className="h-4 w-16" label="Loading the tech tree" />
        <Skeleton className="mt-3 h-4 w-full" />
      </Card>
    )
  }

  const next = tree.data.find((entry) => isOpen(entry.upgrade) && !isOwned(entry.upgrade))

  return (
    <Card>
      <CardHeading
        icon={<Network size={16} aria-hidden />}
        title="Tech tree"
        action={
          <Link
            viewTransition
            to="/upgrades"
            className={`${buttonStyles({ variant: 'ghost', size: 'sm' })} w-14`}
          >
            Open
          </Link>
        }
      />

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {next === undefined ? (
            <p className="text-ink-500 text-sm">Nothing left on the list.</p>
          ) : (
            <>
              <p className="text-ink-500 text-xs font-medium tracking-wide uppercase">Next</p>
              <p className="text-ink-50 mt-0.5 truncate text-sm font-medium">
                {next.upgrade.title}
              </p>
              {blocker(next.gates) !== undefined && (
                <p className="text-ink-500 mt-0.5 text-xs">{blocker(next.gates)}</p>
              )}
            </>
          )}
        </div>

        {tree.data.length > 0 && <OwnedTree entries={tree.data} />}
      </div>
    </Card>
  )
}
