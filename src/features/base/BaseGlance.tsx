import { Home } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardHeading } from '@/components/shared/primitives'
import { PercentRing } from '@/components/shared/PercentRing'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/shared/styles'
import { describeClear } from '@/domain/base/declutter'

import { useHouse } from './hooks'

const ROW_LABEL = 'text-ink-500 text-xs font-medium tracking-wide uppercase'

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
 * **Clutter only, now.** The Projects row named the next house job and
 * its step; house jobs left with the quests — _"drop them too"_ — and
 * are worked through in Notion.
 */
export function BaseGlance() {
  const house = useHouse()

  if (house.data === undefined) {
    return (
      <Card>
        <Skeleton className="h-4 w-16" label="Loading Base" />
        <Skeleton className="mt-3 h-4 w-full" />
      </Card>
    )
  }

  return (
    <Card>
      <CardHeading
        icon={<Home size={16} aria-hidden />}
        title="Base"
        action={
          <Link
            viewTransition
            to="/base"
            className={`${buttonStyles({ variant: 'ghost', size: 'sm' })} w-14`}
          >
            Open
          </Link>
        }
      />

      <dl>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <dt className={ROW_LABEL}>Clutter</dt>
            <dd className="mt-0.5 text-sm">
              {house.data.clear === undefined ? (
                <span className="text-ink-500">No room read yet</span>
              ) : (
                <>
                  <span className="text-ink-50 font-medium">{String(house.data.clear)}% clear</span>
                  <span className="text-ink-300"> · {describeClear(house.data.clear)}</span>
                </>
              )}
            </dd>
          </div>

          {house.data.clear !== undefined && (
            <PercentRing
              value={house.data.clear}
              good={house.data.clear >= 70}
              label={`Clutter: ${String(house.data.clear)}% clear, ${describeClear(house.data.clear)}`}
            />
          )}
        </div>
      </dl>
    </Card>
  )
}
