import { Network } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardHeading } from '@/components/shared/primitives'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/shared/styles'
import type { Gate } from '@/domain/game/tree'
import type { TreeEntry } from '@/domain/upgrades/recommendation'
import { formatMinorUnits, isOpen, isOwned } from '@/domain/upgrades/upgrade'
import { cn } from '@/lib/cn'

import { useWholeTree } from './hooks'

/**
 * The tech tree, at a glance — see `BaseGlance` for why this exists.
 *
 * **The highest-priority entry still worth wanting, not the whole
 * tree.** `wholeTree` already returns every entry ranked — effective
 * priority, own priority, then cheapest and by name — so "next" is just
 * the first one that is neither owned nor dropped.
 *
 * **No savings gauge, because nothing is saved.** It drew a thermometer
 * of the banked pool against the price, and the pool went with finance
 * tracking — reported as _"we aren't tracking how much we have saved or
 * anything anymore, remember?"_ A tube sitting at 0% forever over
 * "Nothing banked" was the card describing a feature that no longer
 * exists. What is left is a reading the tree actually holds: how much of
 * the list you already own.
 */
function OwnedGrid({ entries }: { readonly entries: readonly TreeEntry[] }) {
  const listed = entries.filter((entry) => entry.upgrade.status !== 'cancelled')
  const shown = listed.slice(0, 12)
  const owned = listed.filter((entry) => isOwned(entry.upgrade)).length

  return (
    <div
      role="img"
      aria-label={`${String(owned)} of ${String(listed.length)} upgrades owned`}
      className="hidden w-14 shrink-0 flex-col items-center gap-1.5 lg:flex"
    >
      <span className="numeric text-ink-100 text-xs font-semibold">
        {owned}/{listed.length}
      </span>
      <div className="grid grid-cols-4 gap-1" aria-hidden>
        {shown.map((entry) => (
          <span
            key={entry.upgrade.id}
            className={cn(
              'size-2.5 rounded-[3px]',
              isOwned(entry.upgrade) ? 'bg-accent-500' : 'bg-ink-800 ring-ink-700 ring-1',
            )}
          />
        ))}
      </div>
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
  const price = next?.upgrade.estimatedCostMinorUnits

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
              <p className="numeric text-ink-300 mt-0.5 text-sm">
                {price === undefined ? 'No price yet' : formatMinorUnits(price)}
              </p>
              {blocker(next.gates) !== undefined && (
                <p className="text-ink-500 mt-0.5 text-xs">{blocker(next.gates)}</p>
              )}
            </>
          )}
        </div>

        {tree.data.length > 0 && <OwnedGrid entries={tree.data} />}
      </div>
    </Card>
  )
}
