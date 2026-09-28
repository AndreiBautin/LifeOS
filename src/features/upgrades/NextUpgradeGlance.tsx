import { Network } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardHeading } from '@/components/shared/primitives'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/shared/styles'
import { formatMinorUnits, isOpen, isOwned } from '@/domain/upgrades/upgrade'
import { cn } from '@/lib/cn'

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
 * **A savings gauge, not a ring.** The first pass gave this the same
 * ring `Base`, Working-through and the map glances all got, and it read
 * back correctly: "you literally just added the same visual to all of
 * them... it should be a unique interesting visual for each." A vertical
 * fill reads as a fundraising thermometer, which is closer to what this
 * actually is — money accumulating toward one thing — than an abstract
 * percentage circle ever was. Still the same reading underneath:
 * `pool.data.availableMinor` against `next.upgrade.estimatedCostMinorUnits`
 * is the exact arithmetic already deciding whether "Short" gets printed.
 * A pool allowed to run negative clamps to an empty tube rather than a
 * nonsense negative fill.
 */
function SavingsGauge({ percent, label }: { readonly percent: number; readonly label: string }) {
  const clamped = Math.max(0, Math.min(100, percent))
  const complete = clamped >= 100

  return (
    <div
      className="hidden w-14 shrink-0 flex-col items-center gap-1.5 lg:flex"
      role="img"
      aria-label={label}
    >
      <span className="numeric text-ink-100 text-xs font-semibold">{Math.round(clamped)}%</span>
      <div className="bg-ink-800 relative h-14 w-3 overflow-hidden rounded-full" aria-hidden>
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 rounded-full transition-[height]',
            complete ? 'bg-good-500' : 'bg-accent-500',
          )}
          style={{
            height: `${String(clamped)}%`,
            boxShadow: complete ? '0 0 6px var(--color-good-500)' : undefined,
          }}
        />
      </div>
    </div>
  )
}

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
  /*
   * Clamped here, not just where it is drawn — the ring's own arc always
   * stopped at one full circle, and the label used to keep going past it
   * regardless, announcing "1740% saved" for a pool that had long since
   * covered the price. A pool cannot save more than 100% of anything;
   * the rest is surplus toward whatever comes after this one.
   */
  const saved =
    price === undefined || price <= 0
      ? undefined
      : Math.min(100, Math.max(0, (pool.data.availableMinor / price) * 100))

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
            <SavingsGauge
              percent={saved}
              label={`${String(Math.round(saved))}% of the price saved toward ${next.upgrade.title}`}
            />
          )}
        </div>
      )}
    </Card>
  )
}
