import { MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

import { CountRing } from '@/components/shared/CountRing'
import { Card, CardHeading } from '@/components/shared/primitives'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/shared/styles'
import { formatArea } from '@/application/use-cases/atlas/exploration'
import { isResolved } from '@/domain/atlas/place/Place'

import { useAtlas } from './hooks'

/**
 * The map, at a glance — see `BaseGlance` for why this exists.
 *
 * **Ground covered and what is left to go, not the map itself.** A
 * Leaflet tile is the page's own visual and does not shrink to a
 * dashboard card without losing the thing that makes it useful — so
 * this reads the same two facts `AtlasPage`'s own headers already
 * state in words: the area walked, and how many saved places have not
 * been visited yet.
 *
 * **Visited over every place with a location, as a `CountRing`.**
 * Asked for directly, alongside the tech tree and Working-through
 * glances: "needs the same treatment." A place with no point yet is a
 * deliberate, supported entry — a name to resolve later — so it is left
 * out of the denominator the same way `isResolved` already excludes it
 * from `outstanding`; counting it as neither visited nor to-go would be
 * inventing a third state this reading has no business claiming.
 */
export function MapGlance() {
  const atlas = useAtlas()

  if (atlas.data === undefined) {
    return (
      <Card>
        <Skeleton className="h-4 w-16" label="Loading the map" />
        <Skeleton className="mt-3 h-4 w-full" />
      </Card>
    )
  }

  const resolved = atlas.data.places.filter(isResolved)
  const outstanding = resolved.filter(
    (place) => place.status !== 'visited' && place.status !== 'archived',
  ).length
  const visited = resolved.length - outstanding

  return (
    <Card>
      <CardHeading
        icon={<MapPin size={16} aria-hidden />}
        title="Map"
        action={
          <Link to="/map" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
            Open
          </Link>
        }
      />

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-ink-500 text-sm">
            {formatArea(atlas.data.areaKm2)} covered · {atlas.data.cellCount.toString()} squares
          </p>
          <p className="text-ink-500 mt-0.5 text-sm">
            {outstanding === 0
              ? 'Everywhere saved has been visited.'
              : `${outstanding.toString()} places to go`}
          </p>
        </div>

        {resolved.length > 0 && (
          <CountRing
            done={visited}
            total={resolved.length}
            label={`${String(visited)} of ${String(resolved.length)} saved places visited`}
          />
        )}
      </div>
    </Card>
  )
}
