import { Network } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardHeading } from '@/components/shared/primitives'
import { PercentRing } from '@/components/shared/PercentRing'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/shared/styles'
import { formatMinorUnits, isOpen, isOwned } from '@/domain/upgrades/upgrade'

import { useSpendingPool, useWholeTree } from './hooks'

/**
 * The tech tree, at a glance — see `BaseGlance` for why this exists.
 *
 * **The highest-priority entry still worth wanting, not the whole
 * tree.** `wholeTree` already returns every entry ranked — effective
 * priority first, own priority as the tiebreak — so "next" is just the
 * first one that is neither owned nor dropped. No second ranking
 * invented for one line of text, the same call `BaseGlance` makes about
 * its own job list.
 *
 * **Locked is said plainly rather than hidden.** A prerequisite or a
 * shortfall is exactly what the full tree would tell you first, so the
 * badge here is the same word `TechTree`'s own node draws.
 *
 * **The pool's own share of the price, as a `PercentRing`.** Asked for
 * directly, alongside the Working-through and map glances: "needs the
 * same treatment." Not a new reading — `pool.data.availableMinor`
 * against `next.upgrade.estimatedCostMinorUnits` is the exact
 * arithmetic already deciding whether "Short" gets printed, only shown
 * here as a number instead of implied by one word. A pool allowed to
 * run negative clamps to 0% rather than reading as a nonsense negative
 * share.
 */
export function NextUpgradeGlance() {
  const pool = useSpendingPool()
  const tree = useWholeTree(pool.data?.availableMinor ?? 0)

  if (pool.data === undefined || tree.data === undefined) {
    return (
      <Card>
        <Skeleton className="h-4 w-16" label="Loading the tech tree" />
        <Skeleton className="mt-3 h-4 w-full" />
      </Card>
    )
  }

  const next = tree.data.find((entry) => isOpen(entry.upgrade) && !isOwned(entry.upgrade))
  const price = next?.upgrade.estimatedCostMinorUnits
  const saved =
    price === undefined || price <= 0
      ? undefined
      : Math.max(0, (pool.data.availableMinor / price) * 100)

  return (
    <Card>
      <CardHeading
        icon={<Network size={16} aria-hidden />}
        title="Tech tree"
        action={
          <Link to="/upgrades" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
            Open
          </Link>
        }
      />

      {next === undefined ? (
        <p className="text-ink-500 text-sm">Nothing left to save for.</p>
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-ink-50 truncate text-sm font-medium">{next.upgrade.title}</p>
            <p className="text-ink-500 numeric mt-0.5 text-sm">
              {next.upgrade.estimatedCostMinorUnits === undefined
                ? 'No estimate yet'
                : formatMinorUnits(next.upgrade.estimatedCostMinorUnits)}
              {next.gates.length > 0 &&
                ` · ${next.gates.some((gate) => gate.kind === 'prerequisite') ? 'Locked' : 'Short'}`}
            </p>
          </div>

          {saved !== undefined && (
            <PercentRing
              value={saved}
              good={saved >= 100}
              label={`${String(Math.round(saved))}% of the price saved toward ${next.upgrade.title}`}
            />
          )}
        </div>
      )}
    </Card>
  )
}
