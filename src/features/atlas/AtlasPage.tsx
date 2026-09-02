import { PageHeader } from '@/components/shared/PageHeader'
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
import type { PlaceSearchResult } from '@/domain/atlas/PlaceSearch'
import { filterPlaces } from '@/application/use-cases/atlas/FilterPlaces'
import { sortPlaces, type PlaceSortOption } from '@/application/use-cases/atlas/SortPlaces'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { AreaLadders } from '@/features/character/CharacterParts'
import { buttonStyles } from '@/components/shared/styles'
import type { CategoryId } from '@/domain/atlas/category/CategoryDefinition'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import { isResolved, type Place } from '@/domain/atlas/place/Place'

import { PasteList } from './PasteList'
// The geocoder lives with the inbox because that is where it was first
// needed. It is the same hook, the same debounce and the same rate
// floor — this screen just had no way to reach it.
import { usePlaceSearch } from './inbox-hooks'
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

/**
 * Adding a place, with the geocoder that was already here.
 *
 * The search existed from the start and was reachable from exactly one
 * screen: the inbox, where it *repairs* a place saved without a point.
 * So the ordinary path — open the map, press Add, type a name — had no
 * geocoding at all, and produced either a pin dropped wherever you were
 * standing or an entry with no location that you had to go and fix
 * somewhere else. The machinery was complete; nothing connected it to
 * the form people actually use.
 *
 * **Picking a suggestion is optional and always was.** A place with no
 * point is a deliberate, supported entry — a name you mean to resolve
 * later — so the suggestions sit under the field as an offer rather than
 * a requirement, and typing a name nobody has heard of still adds it.
 */
/**
 * Suggestions under the name field.
 *
 * Biased toward where the map is looking, which is most of what makes
 * this feel like a map rather than a search engine: "the coffee place"
 * near you and "the coffee place" in another country are different
 * answers, and only one of them is ever wanted.
 *
 * Silent until there is something to say. `usePlaceSearch` will not fire
 * below three characters and debounces for half a second — Nominatim is
 * run on donations and allows one request a second — so an empty list
 * here usually means "still typing" rather than "nothing exists", and
 * saying either would be wrong.
 */
function AddSuggestions({
  query,
  near,
  onPick,
}: {
  readonly query: string
  readonly near?: Coordinates
  readonly onPick: (result: PlaceSearchResult) => void
}) {
  const search = usePlaceSearch(query, near)

  if (query.trim().length < 3) return null
  if (search.isFetching) return <p className="text-ink-600 mt-1.5 text-xs">Looking…</p>

  if (search.error !== null) {
    return (
      <p role="alert" className="text-bad-500 mt-1.5 text-xs">
        {search.error.message}
      </p>
    )
  }

  if (search.data === undefined) return null

  if (search.data.length === 0) {
    return (
      <p className="text-ink-600 mt-1.5 text-xs">
        Nothing found by that name — you can still add it and place it later.
      </p>
    )
  }

  return (
    <ul className="divide-ink-800 border-ink-800 mt-1.5 divide-y rounded-lg border">
      {search.data.slice(0, 5).map((result) => (
        <li key={`${result.providerId}:${result.providerPlaceId}`}>
          <button
            type="button"
            className="hover:bg-ink-850 w-full px-2 py-2 text-left"
            onClick={() => {
              onPick(result)
            }}
          >
            <span className="text-ink-100 block truncate text-sm">{result.name}</span>
            <span className="text-ink-600 block truncate text-xs">{result.displayName}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function AddPlace({ at, near }: { readonly at?: Coordinates; readonly near?: Coordinates }) {
  const add = useAddPlace()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<string>('other')

  /*
   * What the geocoder returned for the name in the box, if anything was
   * chosen. Cleared the moment the text changes again: a pin from
   * "Blue Bottle" must not survive being edited to "Blue Mountain", which
   * would file the second name at the first one's coordinates.
   */
  const [picked, setPicked] = useState<
    { readonly coordinates: Coordinates; readonly label: string } | undefined
  >(undefined)

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim() === '') return

          /*
           * A chosen result wins over where you are standing. Both are
           * real answers to "where is this", and only one of them was
           * chosen deliberately — dropping a searched-for restaurant at
           * your own front door because the GPS had a fix would be the
           * worse of the two by a wide margin.
           */
          const point = picked?.coordinates ?? at

          add.mutate(
            {
              name,
              categoryId: categoryId as CategoryId,
              ...(point === undefined
                ? {}
                : { latitude: point.latitude, longitude: point.longitude }),
            },
            {
              onSuccess: (result) => {
                if (result.error !== undefined) return
                setName('')
                setPicked(undefined)
              },
            },
          )
        }}
      >
        <div>
          <input
            className={FIELD}
            value={name}
            aria-label="Somewhere to go"
            placeholder="Somewhere you want to go"
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value)
              setPicked(undefined)
            }}
          />

          {picked === undefined ? (
            <AddSuggestions
              query={name}
              {...(near === undefined ? {} : { near })}
              onPick={(result) => {
                setName(result.name)
                setPicked({ coordinates: result.coordinates, label: result.displayName })
              }}
            />
          ) : (
            /*
             * What was chosen, spelled out. Two results can share a name
             * three streets apart, so the confirmation has to be the
             * provider's full label rather than a tick.
             */
            <p className="text-ink-600 mt-1.5 flex items-start gap-1.5 text-xs">
              <MapPin size={12} className="mt-0.5 shrink-0" aria-hidden />
              <span className="min-w-0">{picked.label}</span>
            </p>
          )}
        </div>

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
          {picked !== undefined ? 'Add this one' : at === undefined ? 'Add a place' : 'Add here'}
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
      <PageHeader title="Map" subtitle="Places worth going, and the ground you have covered." />

      <Section
        title="The world"
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

      {/*
        **The exploration ladder, on the screen the walking is drawn
        on.** It has now been homeless twice: lost when the area cards
        were deleted, restored under the Wayfaring trait, and moved here
        when the traits went back to bars alone. This is the home that
        should stick — the share of a region walked belongs beside the
        fog it is computed from.

        It reads "Nothing measured yet" until `exploredRegionKm2` is set
        in Settings, which is the honest state rather than an empty one:
        the denominator is a person's statement about which region they
        mean, and nothing here can guess it.
      */}
      <Section title="Ground covered" description="The share of your named region walked">
        <Card>
          <AreaLadders area="places" />
        </Card>
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
        {adding && (
          <AddPlace
            {...(walk.fix === undefined ? {} : { at: walk.fix.coordinates })}
            near={centre}
          />
        )}
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
