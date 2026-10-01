import { MapPin } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useServices } from '@/app/context'
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
 * with a point, else the middle of the ground walked, else where the
 * device is — if it has already been allowed to say. With none of those
 * it draws `FogPlaceholder` rather than a fallback city as if it were
 * yours: the first version drew nothing at all there, and the report was
 * fair — _"this still doesn't have a mini map or anything."_
 */
/**
 * Where the device is, but only if it has already said it may tell us.
 *
 * Today must never be the screen that pops a location prompt — it opens
 * on every launch, and a permission asked for by a dashboard card is one
 * nobody chose to give. So this checks the permission first and reads a
 * fix only when it is already `granted`, which it is once Walk has been
 * used on the Map.
 */
function usePermittedPosition(): Coordinates | undefined {
  const { geolocation } = useServices()
  const [position, setPosition] = useState<Coordinates | undefined>(undefined)

  useEffect(() => {
    const alive = { current: true }
    void (async () => {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' })
        if (status.state !== 'granted') return
        const fix = await geolocation.getCurrentPosition()
        if (alive.current && fix.ok) setPosition(fix.value)
      } catch {
        // No permissions API, or it refused the query: draw the fog instead.
      }
    })()
    return () => {
      alive.current = false
    }
  }, [geolocation])

  return position
}

/**
 * A map with nothing of yours on it yet: fog, drawn as the squares the
 * real map clears, and the way to start clearing them. Not a tile layer
 * of a city picked by the app — that would be a map of somewhere that is
 * not yours wearing your card.
 */
function FogPlaceholder() {
  return (
    <Link
      viewTransition
      to="/map"
      className="border-ink-800 bg-ink-900 relative mt-3 grid h-40 place-items-center overflow-hidden rounded-xl border"
    >
      <span
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-ink-800) 1px, transparent 1px), linear-gradient(90deg, var(--color-ink-800) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      />
      <span className="relative flex flex-col items-center gap-1 px-4 text-center">
        <MapPin size={18} className="text-accent-400" aria-hidden />
        <span className="text-ink-300 text-sm">All fog so far</span>
        <span className="text-ink-500 text-xs">
          Save a place, or press Walk on the map to clear ground
        </span>
      </span>
    </Link>
  )
}

export function MapGlance() {
  const atlas = useAtlas()
  const here = usePermittedPosition()
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
      ? here
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

      {centre === undefined && <FogPlaceholder />}

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
