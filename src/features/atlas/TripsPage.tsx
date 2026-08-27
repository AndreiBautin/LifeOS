import { CalendarDays, MapPin, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { ATLAS_CATEGORIES } from '@/application/use-cases/atlas/atlas'
import type { TripView } from '@/application/use-cases/atlas/trips'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import type { PlaceId } from '@/domain/atlas/place/PlaceId'
import { isResolved } from '@/domain/atlas/place/Place'
import type { TripId } from '@/domain/atlas/trip/TripId'

import { useAtlas } from './hooks'
import { useAddTrip, usePlaceOffTrip, usePlaceOnTrip, useRemoveTrip, useTrips } from './trips-hooks'

/**
 * Trips: a few places, and the days you will be near them.
 *
 * The thin part of the atlas on purpose. A trip owns nothing but a name, a
 * place and some dates — everything else on the card is read off the
 * places it points at, so taking somewhere off an itinerary is never the
 * thing that deletes it.
 *
 * The count that earns its place here is **unplaced**: the number of
 * places on the trip that still have no point on the map. That is the list
 * of things to sort out before leaving, and it is invisible everywhere
 * else.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

const STATUS_LABEL: Record<TripView['status'], string> = {
  current: 'On now',
  upcoming: 'Coming up',
  undated: 'No dates yet',
  past: 'Been',
}

function when(view: TripView): string {
  const { startDate, endDate } = view.trip
  if (startDate === undefined && endDate === undefined) return 'whenever'
  if (startDate !== undefined && endDate !== undefined) return `${startDate} → ${endDate}`
  return startDate ?? endDate ?? ''
}

function AddToTrip({ id, taken }: { readonly id: TripId; readonly taken: readonly PlaceId[] }) {
  const atlas = useAtlas()
  const add = usePlaceOnTrip()

  const saved = atlas.data?.places ?? []
  const available = saved.filter((place) => !taken.includes(place.id))

  if (available.length === 0) {
    // Two different empties. "Everything is already on this" said to
    // somebody who has saved nothing at all is simply untrue, and it sends
    // them looking for the list it claims exists.
    return (
      <p className="text-ink-500 text-xs">
        {saved.length === 0
          ? 'Nothing saved yet — add somewhere on the map first.'
          : 'Every place you have saved is already on this.'}
      </p>
    )
  }

  return (
    <label className="block">
      <span className={LABEL}>Add a place</span>
      <select
        className={FIELD}
        value=""
        aria-label="Add a place to this trip"
        onChange={(event) => {
          if (event.target.value === '') return
          add.mutate({ id, placeId: event.target.value as PlaceId })
        }}
      >
        <option value="">Pick somewhere…</option>
        {available.map((place) => (
          <option key={place.id} value={place.id}>
            {place.name}
            {isResolved(place) ? '' : ' (no point yet)'}
          </option>
        ))}
      </select>
    </label>
  )
}

function TripCard({ view }: { readonly view: TripView }) {
  const remove = useRemoveTrip()
  const off = usePlaceOffTrip()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-ink-50 truncate font-semibold">{view.trip.name}</h3>
            <Badge tone={view.status === 'current' ? 'good' : 'neutral'}>
              {STATUS_LABEL[view.status]}
            </Badge>
          </div>
          <p className="text-ink-500 numeric text-xs">
            {view.trip.location === '' ? when(view) : `${view.trip.location} · ${when(view)}`}
          </p>
        </div>

        <Button
          size="sm"
          variant={confirming ? 'danger' : 'ghost'}
          aria-label={`Remove ${view.trip.name}`}
          onClick={() => {
            if (confirming) {
              remove.mutate(view.trip.id)
              return
            }
            setConfirming(true)
          }}
        >
          {confirming ? 'Sure?' : <Trash2 size={16} aria-hidden />}
        </Button>
      </div>

      <p className="text-ink-500 numeric text-xs">
        {view.places.length.toString()} {view.places.length === 1 ? 'place' : 'places'} ·{' '}
        {view.visited.toString()} visited
        {view.unplaced > 0 && ` · ${view.unplaced.toString()} still without a point`}
      </p>

      {view.places.length > 0 && (
        <ul className="divide-ink-800 divide-y">
          {view.places.map((place) => (
            <li key={place.id} className="flex items-center gap-2 py-2">
              <span aria-hidden className="shrink-0">
                {ATLAS_CATEGORIES.find((one) => one.id === place.categoryId)?.icon ?? '✳️'}
              </span>
              <span className="text-ink-200 min-w-0 flex-1 truncate text-sm">{place.name}</span>
              {!isResolved(place) && <span className="text-ink-600 text-xs">no point yet</span>}
              <button
                type="button"
                className="text-ink-600 hover:text-ink-300 shrink-0 p-1"
                aria-label={`Take ${place.name} off ${view.trip.name}`}
                onClick={() => {
                  off.mutate({ id: view.trip.id, placeId: place.id })
                }}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <AddToTrip id={view.trip.id} taken={view.trip.placeIds} />
      ) : (
        <Button
          size="sm"
          full
          onClick={() => {
            setOpen(true)
          }}
        >
          <MapPin size={16} aria-hidden />
          Add a place
        </Button>
      )}
    </Card>
  )
}

function AddTrip() {
  const add = useAddTrip()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          add.mutate(
            {
              name,
              location,
              // Empty is not a date. Sending one would store the empty
              // string as a day key, which compares as earlier than every
              // real day rather than as absent.
              ...(startDate === '' ? {} : { startDate }),
              ...(endDate === '' ? {} : { endDate }),
            },
            {
              onSuccess: (result) => {
                if (result.trip === undefined) return
                setName('')
                setLocation('')
                setStartDate('')
                setEndDate('')
              },
            },
          )
        }}
      >
        <input
          className={FIELD}
          value={name}
          aria-label="Trip name"
          placeholder="A week in Lisbon"
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
        <input
          className={FIELD}
          value={location}
          aria-label="Where"
          placeholder="Where"
          onChange={(event) => {
            setLocation(event.target.value)
          }}
        />

        <div className="flex gap-2">
          <label className="flex-1">
            <span className={LABEL}>From</span>
            <input
              type="date"
              className={FIELD}
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value)
              }}
            />
          </label>
          <label className="flex-1">
            <span className={LABEL}>To</span>
            <input
              type="date"
              className={FIELD}
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value)
              }}
            />
          </label>
        </div>

        {add.data?.error !== undefined && (
          <p role="alert" className="text-bad-500 text-sm">
            {add.data.error}
          </p>
        )}

        <Button type="submit" variant="primary" full disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Add the trip
        </Button>
      </form>
    </Card>
  )
}

export function TripsPage() {
  const trips = useTrips()
  const [adding, setAdding] = useState(false)

  const views = trips.data ?? []

  return (
    <Section
      title="Trips"
      description={`${views.length.toString()} planned`}
      action={
        <Button
          size="sm"
          onClick={() => {
            setAdding(!adding)
          }}
        >
          <CalendarDays size={16} aria-hidden />
          {adding ? 'Close' : 'Add'}
        </Button>
      }
    >
      {adding && <AddTrip />}

      {views.length === 0 ? (
        <Empty title="Nothing planned">
          A trip is a few saved places and the days you will be near them.
        </Empty>
      ) : (
        <div className="space-y-3">
          {views.map((view) => (
            <TripCard key={view.trip.id} view={view} />
          ))}
        </div>
      )}
    </Section>
  )
}
