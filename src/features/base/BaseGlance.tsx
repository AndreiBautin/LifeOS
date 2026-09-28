import { Home } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardHeading } from '@/components/shared/primitives'
import { PercentRing } from '@/components/shared/PercentRing'
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
 * summary row draws. `Declutter` still owns the room-by-room picture;
 * this owns the one sentence, plus the same headline ring `Declutter`
 * already draws for the identical number.
 *
 * **The ring is `lg` and up only, the same restriction `PercentRing`
 * already carries everywhere else it appears.** Asked for directly
 * against a screenshot of this exact card — *"lets make this page more
 * interesting with some sort of visual as well"* — after weighing it
 * against the glance card's own original reasoning: a ring here reads
 * as one more on a page that already has several. `PercentRing`'s
 * built-in `lg:` gate is what keeps that reasoning true on the phone
 * this card is mostly seen on, and turns it into extra texture only on
 * the wide screens with room to spare — the same trade `Declutter`
 * itself already makes for its own ring.
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

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-ink-500 text-sm">
            {house.data.clear === undefined
              ? 'Nothing read yet.'
              : `The house is ${describeClear(house.data.clear)}, ${String(house.data.clear)}% clear.`}
          </p>

          {next !== undefined && (
            <p className="text-ink-50 mt-1 truncate text-sm font-medium">{next.name}</p>
          )}
        </div>

        {house.data.clear !== undefined && (
          <PercentRing
            value={house.data.clear}
            good={house.data.clear >= 70}
            label={`The house is ${describeClear(house.data.clear)}, ${String(house.data.clear)}% clear`}
          />
        )}
      </div>
    </Card>
  )
}
