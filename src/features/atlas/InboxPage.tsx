import { Crosshair, Inbox, MapPin, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ATLAS_CATEGORIES } from '@/application/use-cases/atlas/atlas'
import { Button, Card, Empty, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import type { Place } from '@/domain/atlas/place/Place'

import { useHereFor, usePlaceFromText, usePlaceSearch, useUnplaced } from './inbox-hooks'

/**
 * Everything saved by name that has no point on the map yet.
 *
 * This pile exists on purpose. Pasting twelve names out of a message is
 * the fast way to get them saved, and demanding a coordinate for each
 * would turn a thirty-second capture into an evening — so the coordinates
 * are deferred, and this is where they get dealt with.
 *
 * Three ways to place one. Two are local — paste anything a maps app
 * would share (a link, a `geo:` URI, a pair of numbers), or say you are
 * standing there. The third, searching by name, asks Nominatim, and is
 * the only thing in the atlas that leaves the device.
 *
 * That is the same organisation whose tiles the map already draws on
 * every pan, so it is a wider use of a relationship the app already has
 * rather than a new one. It runs on donations and allows one request a
 * second: the query is debounced, and nothing here calls it in a loop.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'

/**
 * Search results for one place, offered as a list to pick from.
 *
 * Deliberately shows the provider's full label rather than just the name:
 * three things called "The Crown" within a mile is the normal case, and
 * the only way to tell them apart is the address underneath.
 */
function Suggestions({
  query,
  onPick,
}: {
  readonly query: string
  readonly onPick: (latitude: number, longitude: number) => void
}) {
  const search = usePlaceSearch(query)

  if (search.isFetching) {
    return <p className="text-ink-600 text-xs">Looking…</p>
  }
  if (search.error !== null) {
    return (
      <p role="alert" className="text-bad-500 text-xs">
        {search.error.message}
      </p>
    )
  }
  if (search.data === undefined) return null
  if (search.data.length === 0) {
    return <p className="text-ink-600 text-xs">Nothing found by that name.</p>
  }

  return (
    <ul className="divide-ink-800 divide-y">
      {search.data.map((result) => (
        <li key={`${result.providerId}:${result.providerPlaceId}`}>
          <button
            type="button"
            className="hover:bg-ink-850 w-full rounded-lg px-2 py-2 text-left"
            onClick={() => {
              onPick(result.coordinates.latitude, result.coordinates.longitude)
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

function UnplacedRow({ place }: { readonly place: Place }) {
  const fromText = usePlaceFromText()
  const here = useHereFor()
  const [text, setText] = useState('')
  const [searching, setSearching] = useState(false)

  const category = ATLAS_CATEGORIES.find((one) => one.id === place.categoryId)
  const error = fromText.data?.error ?? here.data?.error

  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <span aria-hidden>{category?.icon ?? '✳️'}</span>
        <span className="text-ink-50 min-w-0 flex-1 truncate font-medium">{place.name}</span>
        <span className="text-ink-600 text-xs">{category?.label}</span>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim() === '') return
          fromText.mutate({ id: place.id, text })
        }}
      >
        <input
          className={FIELD}
          value={text}
          aria-label={`A link or coordinates for ${place.name}`}
          placeholder="Paste a link or 51.5,-0.12"
          onChange={(event) => {
            setText(event.target.value)
          }}
        />
        <Button type="submit" size="sm" variant="primary" disabled={fromText.isPending}>
          <MapPin size={16} aria-hidden />
          Place
        </Button>
        <Button
          size="sm"
          aria-label={`Place ${place.name} where I am`}
          disabled={here.isPending}
          onClick={() => {
            here.mutate(place.id)
          }}
        >
          <Crosshair size={16} aria-hidden />
          Here
        </Button>
        <Button
          size="sm"
          aria-label={`Search for ${place.name} by name`}
          onClick={() => {
            setSearching(!searching)
          }}
        >
          <Search size={16} aria-hidden />
          Find
        </Button>
      </form>

      {searching && (
        <Suggestions
          // Its own name is what you would type anyway, so it starts there
          // rather than making somebody retype what is already on screen.
          query={text.trim() === '' ? place.name : text}
          onPick={(latitude, longitude) => {
            // The name you gave it is kept. A result's own label is an
            // address, and replacing "that bar Sam mentioned" with
            // "12, Rua Whatever, 1400-209" loses the only part of it you
            // would recognise.
            fromText.mutate({
              id: place.id,
              text: `${latitude.toString()},${longitude.toString()}`,
            })
            setSearching(false)
          }}
        />
      )}

      {error !== undefined && (
        <p role="alert" className="text-bad-500 text-sm">
          {error}
        </p>
      )}
    </Card>
  )
}

export function InboxPage() {
  const unplaced = useUnplaced()
  const places = unplaced.data ?? []

  return (
    <Section
      title="Waiting for a point"
      description={`${places.length.toString()} saved by name only`}
      action={
        <Link to="/map" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
          The map
        </Link>
      }
    >
      {places.length === 0 ? (
        <Empty title="Nothing waiting">
          <span className="inline-flex items-center gap-2">
            <Inbox size={16} aria-hidden />
            Everywhere you have saved is on the map.
          </span>
        </Empty>
      ) : (
        <div className="space-y-3">
          {places.map((place) => (
            <UnplacedRow key={place.id} place={place} />
          ))}
        </div>
      )}
    </Section>
  )
}
