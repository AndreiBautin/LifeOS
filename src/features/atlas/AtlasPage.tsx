import {
  CalendarDays,
  Check,
  ClipboardList,
  Footprints,
  Heart,
  Inbox,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { MapMarker } from '@/application/use-cases/atlas/MapAdapterProps'
import { ATLAS_CATEGORIES } from '@/application/use-cases/atlas/atlas'
import { exploredBounds, formatArea } from '@/application/use-cases/atlas/exploration'
import { filterPlaces } from '@/application/use-cases/atlas/FilterPlaces'
import { sortPlaces, type PlaceSortOption } from '@/application/use-cases/atlas/SortPlaces'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import type { CategoryId } from '@/domain/atlas/category/CategoryDefinition'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import { isResolved, type Place } from '@/domain/atlas/place/Place'

import { PasteList } from './PasteList'
import {
  useAddPlace,
  useAtlas,
  useFavouritePlace,
  useRemovePlace,
  useVisitPlace,
  useWalk,
} from './hooks'

/**
 * The atlas: places worth going to, and the ground you have covered.
 *
 * The fog is the point. Everywhere you have not stood is shaded, and it
 * clears in 150-metre squares as you walk — which is the one thing in this
 * hub that rewards leaving the house, and the reason it is the only
 * absorbed area with a ladder rather than a rating: a named region has a
 * boundary, so coverage genuinely has a top.
 *
 * The map itself is loaded lazily. Leaflet and its clustering plugin are
 * about 190 kB, which is a large thing to hand every visitor for a screen
 * most sessions never open.
 */

const MapView = lazy(async () => {
  const module = await import('@/infrastructure/map/leaflet/LeafletMapAdapter')
  return { default: module.LeafletMapAdapter }
})

const EMPTY_PLACES: readonly Place[] = []

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

/** Somewhere to look when there is nothing else to centre on. */
const FALLBACK_CENTRE: Coordinates = { latitude: 51.5074, longitude: -0.1278 }

function PlaceRow({ place }: { readonly place: Place }) {
  const visit = useVisitPlace()
  const favourite = useFavouritePlace()
  const remove = useRemovePlace()
  const [confirming, setConfirming] = useState(false)

  const category = ATLAS_CATEGORIES.find((one) => one.id === place.categoryId)

  return (
    <div className="flex items-center gap-3 py-2">
      <span aria-hidden className="shrink-0 text-lg">
        {category?.icon ?? '✳️'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-ink-50 truncate text-sm font-medium">{place.name}</p>
        <p className="text-ink-500 truncate text-xs">
          {category?.label ?? 'Other'}
          {place.location.city !== undefined && ` · ${place.location.city}`}
          {!isResolved(place) && ' · no point yet'}
        </p>
      </div>

      {place.status === 'visited' && <Badge tone="good">visited</Badge>}
      {place.favorite && (
        <Heart size={14} className="text-accent-400 shrink-0" aria-label="Favourite" />
      )}

      {place.status !== 'visited' && (
        <Button
          size="sm"
          aria-label={`Mark ${place.name} visited`}
          onClick={() => {
            visit.mutate(place.id)
          }}
        >
          <Check size={16} aria-hidden />
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        aria-label={`Favourite ${place.name}`}
        onClick={() => {
          favourite.mutate(place.id)
        }}
      >
        <Heart size={16} aria-hidden />
      </Button>

      <Button
        variant={confirming ? 'danger' : 'ghost'}
        size="sm"
        aria-label={confirming ? `Confirm removing ${place.name}` : `Remove ${place.name}`}
        onClick={() => {
          if (confirming) {
            remove.mutate(place.id)
            setConfirming(false)
          } else {
            setConfirming(true)
          }
        }}
      >
        {confirming ? 'Sure?' : <Trash2 size={16} aria-hidden />}
      </Button>
    </div>
  )
}

function AddPlace({ at }: { readonly at?: Coordinates }) {
  const add = useAddPlace()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string>('other')

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() === '') return

          add.mutate(
            {
              name,
              categoryId: categoryId as CategoryId,
              /*
               * Captured at wherever the map is looking, when it is
               * looking somewhere real. A place with no point is a
               * perfectly good entry — it is a name you mean to resolve
               * later — so this is not required.
               */
              ...(at === undefined ? {} : { latitude: at.latitude, longitude: at.longitude }),
            },
            {
              onSuccess: (result) => {
                if (result.error !== undefined) return
                setName('')
              },
            },
          )
        }}
      >
        <input
          className={FIELD}
          value={name}
          aria-label="Somewhere to go"
          placeholder="Somewhere you want to go"
          onChange={(event) => {
            setName(event.target.value)
          }}
        />

        <div className="flex gap-2">
          <label className="flex-1">
            <span className={LABEL}>Kind</span>
            <select
              className={FIELD}
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value)
              }}
            >
              {ATLAS_CATEGORIES.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {add.data?.error !== undefined && (
          <p role="alert" className="text-bad-500 text-sm">
            {add.data.error}
          </p>
        )}

        <Button type="submit" variant="primary" full disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Add {at === undefined ? 'a place' : 'here'}
        </Button>
      </form>
    </Card>
  )
}

const SORT_LABELS: Record<PlaceSortOption, string> = {
  recentlyAdded: 'Newest first',
  recentlyVisited: 'Recently visited',
  alphabetical: 'A to Z',
  distance: 'Nearest',
  priority: 'Priority',
}

export function AtlasPage() {
  const atlas = useAtlas()
  const walk = useWalk()
  const [adding, setAdding] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('')
  const [sortBy, setSortBy] = useState<PlaceSortOption>('recentlyAdded')

  // Stabilised, so the marker memo below is not rebuilt on every render by
  // a fresh empty array — which following, once a second, would do.
  const places = useMemo(() => atlas.data?.places ?? EMPTY_PLACES, [atlas.data])
  const cells = atlas.data?.cells

  /*
   * Recomputed only when the fog actually changes. Turning a few thousand
   * cells into rectangles on every render — which following would cause
   * once a second — is the sort of thing that makes a map feel broken
   * without anything being wrong.
   */
  const fog = useMemo(() => (cells === undefined ? [] : exploredBounds(cells)), [cells])

  /*
   * Sorting by distance needs somewhere to measure from, and the only
   * honest answer is where you actually are. With no fix the option still
   * works — `sortPlaces` puts every place it cannot measure last — it just
   * cannot order the ones it can.
   */
  const shown = useMemo(
    () =>
      sortPlaces(
        filterPlaces(places, {
          ...(search.trim() === '' ? {} : { searchText: search }),
          ...(category === '' ? {} : { categoryIds: [category as CategoryId] }),
        }),
        sortBy,
        walk.fix?.coordinates,
      ),
    [places, search, category, sortBy, walk.fix],
  )

  // Deliberately built from the filtered list rather than from everything:
  // a map still showing forty pins while the list underneath shows three
  // reads as a bug, whichever one you happen to trust.
  // The size of the pile the paste path creates. Shown only when there is
  // one — a permanent "0 waiting" is a chore that never goes away.
  const unplaced = useMemo(() => places.filter((place) => !isResolved(place)).length, [places])

  const markers: readonly MapMarker[] = useMemo(
    () =>
      shown.filter(isResolved).map((place) => ({
        id: place.id,
        coordinates: place.location.coordinates,
        categoryId: place.categoryId,
        label: place.name,
        icon: ATLAS_CATEGORIES.find((one) => one.id === place.categoryId)?.icon ?? '✳️',
        visited: place.status === 'visited',
        favorite: place.favorite,
      })),
    [shown],
  )

  /*
   * Where you are if it is known, else the first place with a point, else
   * somewhere. The order matters: following would be useless if the map
   * jumped back to a saved place on every reading.
   */
  const centre =
    walk.fix?.coordinates ?? places.find(isResolved)?.location.coordinates ?? FALLBACK_CENTRE

  return (
    <>
      <Section
        title="The atlas"
        description={
          atlas.data === undefined
            ? undefined
            : `${formatArea(atlas.data.areaKm2)} covered · ${atlas.data.cellCount.toString()} squares`
        }
        action={
          <div className="flex gap-2">
            <Link to="/trips" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
              <CalendarDays size={16} aria-hidden />
              Trips
            </Link>
            {unplaced > 0 && (
              <Link to="/map/inbox" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
                <Inbox size={16} aria-hidden />
                {unplaced.toString()} waiting
              </Link>
            )}
            <Button
              size="sm"
              variant={walk.following ? 'danger' : 'primary'}
              onClick={walk.following ? walk.stop : walk.start}
            >
              <Footprints size={16} aria-hidden />
              {walk.following ? 'Stop' : 'Walk'}
            </Button>
          </div>
        }
      >
        <Card className="h-80 overflow-hidden p-0">
          <Suspense
            fallback={
              <div className="text-ink-500 grid h-full place-items-center text-sm">
                Loading the map…
              </div>
            }
          >
            <MapView
              center={centre}
              zoom={walk.following ? 16 : 13}
              markers={markers}
              exploredBounds={fog}
              onMarkerClick={() => undefined}
              {...(walk.fix === undefined
                ? {}
                : {
                    userPosition: {
                      coordinates: walk.fix.coordinates,
                      accuracyMeters: walk.fix.accuracyMeters,
                    },
                  })}
            />
          </Suspense>
        </Card>

        {walk.error !== undefined && (
          <p role="alert" className="text-bad-500 mt-2 text-sm">
            {walk.error.message}
          </p>
        )}

        {walk.following && (
          <p className="text-ink-500 numeric mt-2 text-xs">
            Following · {walk.revealed.toString()} new squares this walk
            {walk.fix !== undefined &&
              ` · accurate to ${Math.round(walk.fix.accuracyMeters).toString()} m`}
          </p>
        )}
      </Section>

      <Section
        title="Places"
        description={`${places.length.toString()} saved · ${places
          .filter((place) => place.status === 'visited')
          .length.toString()} visited`}
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setPasting(!pasting)
                setAdding(false)
              }}
            >
              <ClipboardList size={16} aria-hidden />
              {pasting ? 'Close' : 'Paste'}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setAdding(!adding)
                setPasting(false)
              }}
            >
              <MapPin size={16} aria-hidden />
              {adding ? 'Close' : 'Add'}
            </Button>
          </div>
        }
      >
        {adding && <AddPlace {...(walk.fix === undefined ? {} : { at: walk.fix.coordinates })} />}
        {pasting && <PasteList />}

        {places.length === 0 ? (
          <Empty title="Nowhere yet">
            Add somewhere you mean to go, or start a walk and clear some ground.
          </Empty>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              <input
                className={FIELD}
                value={search}
                aria-label="Search places"
                placeholder="Search"
                onChange={(event) => {
                  setSearch(event.target.value)
                }}
              />
              <select
                className={FIELD}
                value={category}
                aria-label="Filter by kind"
                onChange={(event) => {
                  setCategory(event.target.value)
                }}
              >
                <option value="">All kinds</option>
                {ATLAS_CATEGORIES.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.label}
                  </option>
                ))}
              </select>
              <select
                className={FIELD}
                value={sortBy}
                aria-label="Sort places"
                onChange={(event) => {
                  setSortBy(event.target.value as PlaceSortOption)
                }}
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {shown.length === 0 ? (
              <Empty title="Nothing matches">Try a different search or kind.</Empty>
            ) : (
              <Card className="divide-ink-800 divide-y py-0">
                {shown.map((place) => (
                  <PlaceRow key={place.id} place={place} />
                ))}
              </Card>
            )}
          </>
        )}
      </Section>
    </>
  )
}
