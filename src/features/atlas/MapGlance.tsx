import { MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardHeading } from '@/components/shared/primitives'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/shared/styles'
import { formatArea } from '@/application/use-cases/atlas/exploration'
import { isResolved, type ResolvedPlace } from '@/domain/atlas/place/Place'

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
 * **A cluster of pins, not a ring.** The first pass gave this the same
 * ring `Base`, the tech tree and Working-through all got, and it read
 * back correctly: "you literally just added the same visual to all of
 * them... it should be a unique interesting visual for each." A ring is
 * an abstract fraction; a place actually *is* a pin on this screen's
 * own map, so lighting up the same glyph `CardHeading` already draws
 * for every place that has one — filled once visited, hollow while it
 * is still somewhere to go — reads as this card's own subject rather
 * than a borrowed shape. A place with no point yet is a deliberate,
 * supported entry — a name to resolve later — so it is left out
 * entirely, the same way `isResolved` already excludes it from
 * `outstanding`.
 */
function PinCluster({ places }: { readonly places: readonly ResolvedPlace[] }) {
  const shown = places.slice(0, 9)
  const overflow = places.length - shown.length
  const visited = places.filter(
    (place) => place.status === 'visited' || place.status === 'archived',
  ).length

  return (
    <div className="hidden w-14 shrink-0 flex-col items-end gap-2 lg:flex">
      <span
        className="flex flex-wrap justify-end gap-1"
        aria-label={`${String(visited)} of ${String(places.length)} saved places visited`}
      >
        {shown.map((place) => (
          <MapPin
            key={place.id}
            aria-hidden
            size={14}
            /*
             * Colour rather than fill — lucide's pin is stroke-only, and
             * a lucide icon's own `fill="none"` on its inner path is a
             * presentation attribute set directly on that element, which
             * a `fill-*` class on the outer `svg` cannot override by
             * inheritance. Lit vs dim is the same idiom `LifeWheel`'s
             * legend and the goal pips already use.
             */
            className={
              place.status === 'visited' || place.status === 'archived'
                ? 'text-accent-500'
                : 'text-ink-700'
            }
          />
        ))}
      </span>
      {overflow > 0 && <span className="text-ink-700 numeric text-xs">+{overflow}</span>}
    </div>
  )
}

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

  return (
    <Card>
      <CardHeading
        icon={<MapPin size={16} aria-hidden />}
        title="Map"
        action={
          <Link viewTransition to="/map" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
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

        {resolved.length > 0 && <PinCluster places={resolved} />}
      </div>
    </Card>
  )
}
