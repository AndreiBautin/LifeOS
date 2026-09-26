import { Home } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardHeading } from '@/components/shared/primitives'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/shared/styles'
import { describeClear } from '@/domain/base/declutter'

import { useBaseProjects } from '../projects/hooks'
import { useHouse } from './hooks'

/**
 * Base, at a glance — the same treatment Train and Codex already get on
 * Today. Asked for directly: *"could we add something from each section
 * to you/today like train/codex have? quests, base status, next
 * upgrade."* Quests and Vitals already had one; Base, the tech tree and
 * the map did not, which made the dashboard's promise — "a solid
 * at-a-glance dashboard with the ability to drill into each section" —
 * only half kept.
 *
 * **Two readings, not the full screen.** How clear the house is and
 * what job is furthest along — the same pairing `Declutter`'s own
 * summary row draws, in words rather than a ring, because a glance
 * card sits beside four others and a ring here would be the fourth one
 * on this page alone. `Declutter` still owns the picture; this owns
 * the one sentence.
 *
 * **The job named is the one already open, not the highest priority.**
 * `JobRow` on Base itself ranks by what has actually been started
 * rather than by impact — you did not choose for the tap to leak — and
 * this glance reads the same list in the same order rather than
 * inventing a second ranking for one line of text.
 */
export function BaseGlance() {
  const house = useHouse()
  const jobs = useBaseProjects()

  if (house.data === undefined || jobs.data === undefined) {
    return (
      <Card>
        <Skeleton className="h-4 w-16" label="Loading Base" />
        <Skeleton className="mt-3 h-4 w-full" />
      </Card>
    )
  }

  const next = jobs.data[0]

  return (
    <Card>
      <CardHeading
        icon={<Home size={16} aria-hidden />}
        title="Base"
        action={
          <Link to="/base" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
            Open
          </Link>
        }
      />

      <p className="text-ink-500 text-sm">
        {house.data.clear === undefined
          ? 'Nothing read yet.'
          : `The house is ${describeClear(house.data.clear)}, ${String(house.data.clear)}% clear.`}
      </p>

      {next !== undefined && (
        <p className="text-ink-50 mt-1 truncate text-sm font-medium">{next.name}</p>
      )}
    </Card>
  )
}
