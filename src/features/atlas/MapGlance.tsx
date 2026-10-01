import { MapPin } from 'lucide-react'
import { lazy, Suspense, useMemo } from 'react'
import { Link } from 'react-router-dom'

import { ATLAS_CATEGORIES } from '@/application/use-cases/atlas/atlas'
import { exploredBounds, formatArea } from '@/application/use-cases/atlas/exploration'
import type { MapMarker } from '@/application/use-cases/atlas/MapAdapterProps'
import { Card, CardHeading } from '@/components/shared/primitives'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/shared/styles'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import { isResolved } from '@/domain/atlas/place/Place'

import { useAtlas } from './hooks'

/*
 * The same lazy import `AtlasPage` uses, so Leaflet stays out of the
 * first bundle: Today renders before the map chunk has arrived, and the
 * card holds its height while it does.
 */
const MapView = lazy(async () => {
  const module = await import('@/infrastructure/map/leaflet/LeafletMapAdapter')
  return { default: module.LeafletMapAdapter }
})

/**
 * The map, at a glance — see `BaseGlance` for why this exists.
 *
 * **The map itself now, in miniature.** This used to argue that a
 * Leaflet tile does not shrink to a dashboard card, and drew a cluster
 * of pin glyphs instead. Asked for directly — _"having an actual mini
 * version of the map would be a nice touch"_ — and the argument was about
 * *using* a map at that size, which nobody needs to: this one does not
 * pan, zoom or take a tap. It is a picture of the real one, with the
 * same pins and the same fog, and the whole of it is a link there.
 *
 * **Centred on what you have, never on a guess.** The first saved place
 * with a point, else the middle of the ground walked. With neither there
 * is nothing of yours to draw, so the card stays the two lines of text
 * rather than showing a fallback city as if it were yours.
 */
export function MapGlance() {
  const atlas = useAtlas()
  const cells = atlas.data?.cells
  const places = atlas.data?.places

  const fog = useMemo(() => (cells === undefined ? [] : exploredBounds(cells)), [cells])

  const markers: readonly MapMarker[] = useMemo(
    () =>
      (places ?? []).filter(isResolved).map((place) => ({
        id: place.id,
        coordinates: place.location.coordinates,
        categoryId: place.categoryId,
        label: place.name,
        icon: ATLAS_CATEGORIES.find((one) => one.id === place.categoryId)?.icon ?? '✳️',
        visited: place.status === 'visited',
        favorite: place.favorite,
      })),
    [places],
  )

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

  const firstCell = fog[0]
  const centre: Coordinates | undefined =
    resolved[0]?.location.coordinates ??
    (firstCell === undefined
      ? undefined
      : {
          latitude: (firstCell.north + firstCell.south) / 2,
          longitude: (firstCell.east + firstCell.west) / 2,
        })

  return (
    <Card>
      <CardHeading
        icon={<MapPin size={16} aria-hidden />}
        title="Map"
        action={
          <Link
            viewTransition
            to="/map"
            className={`${buttonStyles({ variant: 'ghost', size: 'sm' })} w-14`}
          >
            Open
          </Link>
        }
      />

      <p className="text-ink-500 text-sm">
        {formatArea(atlas.data.areaKm2)} covered · {atlas.data.cellCount.toString()} squares
      </p>
      <p className="text-ink-500 mt-0.5 text-sm">
        {resolved.length === 0
          ? 'No places saved yet.'
          : outstanding === 0
            ? 'Everywhere saved has been visited.'
            : `${outstanding.toString()} places to go`}
      </p>

      {centre !== undefined && (
        <Link
          viewTransition
          to="/map"
          aria-label="Open the map"
          className="border-ink-800 relative mt-3 block h-40 overflow-hidden rounded-xl border"
        >
          <Suspense fallback={<Skeleton className="h-full w-full" />}>
            <MapView
              center={centre}
              zoom={13}
              markers={markers}
              exploredBounds={fog}
              onMarkerClick={() => undefined}
              interactive={false}
            />
          </Suspense>
          {/*
            Over the tiles, so a tap lands on the link rather than on a
            marker's popup — the card is a doorway, not a second map.
          */}
          <span className="absolute inset-0 z-[500]" aria-hidden />
        </Link>
      )}
    </Card>
  )
}
