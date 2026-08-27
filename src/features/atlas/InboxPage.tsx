import { Crosshair, Inbox, MapPin } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ATLAS_CATEGORIES } from '@/application/use-cases/atlas/atlas'
import { Button, Card, Empty, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import type { Place } from '@/domain/atlas/place/Place'

import { useHereFor, usePlaceFromText, useUnplaced } from './inbox-hooks'

/**
 * Everything saved by name that has no point on the map yet.
 *
 * This pile exists on purpose. Pasting twelve names out of a message is
 * the fast way to get them saved, and demanding a coordinate for each
 * would turn a thirty-second capture into an evening — so the coordinates
 * are deferred, and this is where they get dealt with.
 *
 * Two ways to place one, both local: paste anything a maps app would
 * share (a link, a `geo:` URI, a pair of numbers), or say you are standing
 * there. There is deliberately no search box: finding a place by name
 * means asking a geocoding service, and this app does not make network
 * calls.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'

function UnplacedRow({ place }: { readonly place: Place }) {
  const fromText = usePlaceFromText()
  const here = useHereFor()
  const [text, setText] = useState('')

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
      </form>

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
