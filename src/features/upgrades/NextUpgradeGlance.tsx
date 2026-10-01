import { Network } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardHeading } from '@/components/shared/primitives'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/shared/styles'
import type { TreeEntry } from '@/domain/upgrades/recommendation'
import { shelfOf, UPGRADE_SHELF_LABELS, UPGRADE_SHELVES } from '@/domain/upgrades/shelf'
import { isOwned } from '@/domain/upgrades/upgrade'

import { useWholeTree } from './hooks'

/**
 * The tech tree, at a glance — see `BaseGlance` for why this exists.
 *
 * **What you own, branch by branch — and no "next".** It named the
 * highest-ranked open entry under a NEXT label, reported as not making
 * sense: a wishlist has no order you work through, so naming one item as
 * the next thing to buy was the app inventing a sequence. Each branch
 * says how much of it is already in hand instead.
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
      className="flex w-14 shrink-0 flex-col items-center gap-1"
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

  const listed = tree.data.filter((entry) => entry.upgrade.status !== 'cancelled')
  const branches = UPGRADE_SHELVES.map((shelf) => {
    const on = listed.filter((entry) => shelfOf(entry.upgrade) === shelf)
    return {
      shelf,
      owned: on.filter((entry) => isOwned(entry.upgrade)).length,
      of: on.length,
    }
  }).filter((branch) => branch.of > 0)

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
          {branches.length === 0 ? (
            <p className="text-ink-500 text-sm">Nothing on the list yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {branches.map((branch) => (
                <li
                  key={branch.shelf}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="text-ink-100 truncate">
                    {UPGRADE_SHELF_LABELS[branch.shelf]}
                  </span>
                  <span className="numeric text-ink-500 shrink-0 text-xs">
                    {branch.owned}/{branch.of}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {tree.data.length > 0 && <OwnedTree entries={tree.data} />}
      </div>
    </Card>
  )
}
