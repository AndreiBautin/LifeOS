import { Compass, ExternalLink, MapPin, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useSettings } from '@/app/context'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import {
  CANDIDATE_STANDINGS,
  STANDING_LABELS,
  type HomeCandidate,
  type Scored,
} from '@/domain/homes/candidate'
import { NEARBY_KINDS, NEARBY_LABELS, type NearbyKind } from '@/domain/homes/neighbourhood'
import { formatMinorUnits, toMinorUnits } from '@/domain/upgrades/upgrade'
import { usePlaceSearch } from '@/features/atlas/inbox-hooks'

import {
  useAddHome,
  useHomes,
  usePlaceHome,
  useReadAround,
  useRemoveHome,
  useSetStanding,
} from './hooks'

/**
 * Houses you are considering, and what is actually around them.
 *
 * **Listings cannot be searched, and the screen says so.** Zillow,
 * Redfin and Realtor.com were all tested from a browser and all send no
 * CORS header — there is no way to read them from a client-only app, and
 * an honest limitation stated is better than a search box that never
 * finds anything.
 *
 * What the app *can* do is the other half, and it is the half that is
 * hard to do by hand: geocode the address through the same Nominatim the
 * map already uses, ask OpenStreetMap what is within walking distance,
 * and score the result against what you said you wanted. **Every point
 * is explainable**, the property carried over from the job scorer.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 tap-target w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

/**
 * Adding one, with the address resolved as it is typed.
 *
 * The geocoder is on the form rather than reachable only from a repair
 * screen — the mistake `usePlaceSearch` was written into once, where the
 * capability existed and the ordinary path could not reach it. A pick is
 * optional: an address the geocoder has never heard of still saves, and
 * only loses the neighbourhood reading until somebody places it.
 */
function AddHouse({ onDone }: { readonly onDone: () => void }) {
  const add = useAddHome()
  const [address, setAddress] = useState('')
  const [picked, setPicked] = useState<{ latitude: number; longitude: number } | undefined>()
  const [price, setPrice] = useState('')
  const [beds, setBeds] = useState('')
  const [link, setLink] = useState('')

  const search = usePlaceSearch(picked === undefined ? address : '')

  return (
    <Card className="mb-3">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (address.trim() === '') return

          const asking = toMinorUnits(price)
          const bedrooms = Number(beds)

          add.mutate(
            {
              address,
              ...(picked === undefined ? {} : { point: picked }),
              ...(asking === undefined ? {} : { priceMinor: asking }),
              ...(Number.isFinite(bedrooms) && bedrooms > 0 ? { beds: bedrooms } : {}),
              ...(link.trim() === '' ? {} : { link }),
            },
            { onSuccess: onDone },
          )
        }}
      >
        <div>
          <label className={LABEL} htmlFor="house-address">
            Address
          </label>
          <input
            id="house-address"
            className={FIELD}
            placeholder="14 Maple Street"
            value={address}
            autoFocus
            onChange={(event) => {
              setAddress(event.target.value)
              // The pick is dropped the moment the text changes, or one
              // address would be filed at another's coordinates.
              setPicked(undefined)
            }}
          />
        </div>

        {picked !== undefined && (
          <p className="text-good-500 inline-flex items-center gap-1 text-xs">
            <MapPin size={12} aria-hidden />
            Placed on the map
          </p>
        )}

        {/*
          An offer, never a gate. A house with no point saves fine — it
          simply has no neighbourhood reading until it is placed, which
          the row then offers to do.
        */}
        {picked === undefined && (search.data ?? []).length > 0 && (
          <ul className="space-y-1">
            {(search.data ?? []).slice(0, 4).map((result) => (
              <li
                key={`${String(result.coordinates.latitude)},${String(result.coordinates.longitude)}`}
              >
                <button
                  type="button"
                  className="border-ink-800 hover:bg-ink-850 w-full truncate rounded-lg border px-2 py-1.5 text-left text-xs"
                  onClick={() => {
                    setAddress(result.displayName)
                    setPicked({
                      latitude: result.coordinates.latitude,
                      longitude: result.coordinates.longitude,
                    })
                  }}
                >
                  {result.displayName}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL} htmlFor="house-price">
              Asking
            </label>
            <input
              id="house-price"
              className={FIELD}
              inputMode="decimal"
              placeholder="425000"
              value={price}
              onChange={(event) => {
                setPrice(event.target.value)
              }}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="house-beds">
              Bedrooms
            </label>
            <input
              id="house-beds"
              className={FIELD}
              inputMode="decimal"
              value={beds}
              onChange={(event) => {
                setBeds(event.target.value)
              }}
            />
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="house-link">
            Listing
          </label>
          <input
            id="house-link"
            className={FIELD}
            placeholder="https://…"
            value={link}
            onChange={(event) => {
              setLink(event.target.value)
            }}
          />
        </div>

        <Button type="submit" variant="primary" full disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Add it
        </Button>
      </form>
    </Card>
  )
}

function HouseRow({
  candidate,
  scored,
}: {
  readonly candidate: HomeCandidate
  readonly scored: Scored
}) {
  const around = useReadAround()
  const standing = useSetStanding()
  const remove = useRemoveHome()
  const place = usePlaceHome()
  const [open, setOpen] = useState(false)

  const search = usePlaceSearch(candidate.point === undefined && open ? candidate.address : '')

  return (
    <Card className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            setOpen(!open)
          }}
        >
          <span className="text-ink-50 block truncate text-sm font-medium">
            {candidate.address}
          </span>
          <span className="text-ink-700 numeric block truncate text-xs">
            {candidate.priceMinor !== undefined && formatMinorUnits(candidate.priceMinor)}
            {candidate.beds !== undefined && ` · ${String(candidate.beds)} bed`}
            {candidate.neighbourhood !== undefined &&
              ` · read ${candidate.neighbourhood.readAt.slice(0, 10)}`}
          </span>
        </button>

        {/*
          Unproven rather than a zero. A house nobody has priced and
          nowhere anybody has measured has not scored badly — a bar at
          nought would read as a bad house.
        */}
        {scored.unproven ? (
          <Badge tone="neutral">Not judged</Badge>
        ) : (
          <Badge tone={scored.score >= 70 ? 'good' : 'neutral'}>{scored.score}</Badge>
        )}
      </div>

      {!scored.unproven && (
        <Meter value={scored.score} of={100} height={5} label={candidate.address} />
      )}

      <div className="flex flex-wrap gap-1">
        {CANDIDATE_STANDINGS.map((one) => (
          <button
            key={one}
            type="button"
            aria-pressed={candidate.standing === one}
            className={[
              'tap-target rounded-lg border px-2 text-xs font-medium',
              candidate.standing === one
                ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                : 'border-ink-800 text-ink-500',
            ].join(' ')}
            disabled={standing.isPending}
            onClick={() => {
              standing.mutate({ id: candidate.id, standing: one })
            }}
          >
            {STANDING_LABELS[one]}
          </button>
        ))}
      </div>

      {open && (
        <div className="border-ink-800 space-y-2 border-t pt-2">
          {/*
            Every point, said out loud. The whole property carried over
            from the job scorer is that a house at 74 can say which
            points it earned — a bare number would be a judgement nothing
            here is entitled to make.
          */}
          {scored.reasons.length > 0 && (
            <ul className="space-y-0.5">
              {scored.reasons.map((reason) => (
                <li key={reason.text} className="flex items-baseline gap-2 text-xs">
                  <span
                    className={[
                      'numeric w-8 shrink-0 text-right',
                      reason.points >= 0 ? 'text-good-500' : 'text-bad-500',
                    ].join(' ')}
                  >
                    {reason.points >= 0 ? '+' : ''}
                    {reason.points}
                  </span>
                  <span className="text-ink-300">{reason.text}</span>
                </li>
              ))}
            </ul>
          )}

          {candidate.point === undefined ? (
            <>
              <p className="text-ink-700 text-xs">Place it on the map to read what is around it.</p>
              <ul className="space-y-1">
                {(search.data ?? []).slice(0, 3).map((result) => (
                  <li
                    key={`${String(result.coordinates.latitude)},${String(result.coordinates.longitude)}`}
                  >
                    <button
                      type="button"
                      className="border-ink-800 hover:bg-ink-850 w-full truncate rounded-lg border px-2 py-1.5 text-left text-xs"
                      disabled={place.isPending}
                      onClick={() => {
                        place.mutate({
                          id: candidate.id,
                          point: {
                            latitude: result.coordinates.latitude,
                            longitude: result.coordinates.longitude,
                          },
                        })
                      }}
                    >
                      {result.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              full
              disabled={around.isPending}
              onClick={() => {
                around.mutate(candidate.id)
              }}
            >
              <Compass size={14} aria-hidden />
              {around.isPending
                ? 'Asking OpenStreetMap…'
                : candidate.neighbourhood === undefined
                  ? 'Read the neighbourhood'
                  : 'Read it again'}
            </Button>
          )}

          {/*
            Named rather than left as a quietly lower score. The stored
            reading only covers the kinds that were wanted when it was
            taken, so adding one afterwards leaves it unmeasured -- and a
            zero for something nobody looked for is the thing this app
            refuses everywhere.
          */}
          {scored.unmeasured.length > 0 && candidate.neighbourhood !== undefined && (
            <p className="text-warn-500 text-xs">
              {scored.unmeasured.map((kind) => NEARBY_LABELS[kind]).join(', ')} have not been looked
              for here. Read it again to include them.
            </p>
          )}

          {around.isError && (
            <p className="text-warn-500 text-xs">
              OpenStreetMap did not answer. It is a free service and a busy query times out — try
              again in a minute.
            </p>
          )}

          <div className="flex items-center gap-2">
            {candidate.link !== undefined && (
              <a
                href={candidate.link}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent-400 inline-flex items-center gap-1 text-xs"
              >
                <ExternalLink size={12} aria-hidden />
                The listing
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              aria-label={`Remove ${candidate.address}`}
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(candidate.id)
              }}
            >
              <Trash2 size={14} aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function Wants() {
  const { settings, update } = useSettings()
  const wants = settings.homeWants

  const toggle = (kind: NearbyKind) => {
    update({
      homeWants: {
        ...wants,
        wanted: wants.wanted.includes(kind)
          ? wants.wanted.filter((one) => one !== kind)
          : [...wants.wanted, kind],
      },
    })
  }

  return (
    <Card className="space-y-3">
      <div>
        <span className={LABEL}>Worth having nearby</span>
        <div className="flex flex-wrap gap-1">
          {NEARBY_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={wants.wanted.includes(kind)}
              className={[
                'tap-target rounded-lg border px-2.5 text-xs font-medium',
                wants.wanted.includes(kind)
                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                  : 'border-ink-800 text-ink-500',
              ].join(' ')}
              onClick={() => {
                toggle(kind)
              }}
            >
              {NEARBY_LABELS[kind]}
            </button>
          ))}
        </div>
        {/*
          Measured rather than asserted: all eight kinds around a
          Manhattan address took 13.4 seconds and sometimes timed out;
          three took 1.8. Only the wanted kinds are ever asked for.
        */}
        <p className="text-ink-700 mt-1 text-xs">
          Only these are asked for — every extra one makes the lookup slower.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL} htmlFor="wants-budget">
            Top of the budget
          </label>
          <input
            id="wants-budget"
            className={FIELD}
            inputMode="decimal"
            placeholder="450000"
            defaultValue={
              wants.maxPriceMinor === undefined ? '' : String(wants.maxPriceMinor / 100)
            }
            onBlur={(event) => {
              const asking = toMinorUnits(event.target.value)
              const { maxPriceMinor: _cleared, ...rest } = wants
              update({
                homeWants: { ...rest, ...(asking === undefined ? {} : { maxPriceMinor: asking }) },
              })
            }}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="wants-beds">
            Bedrooms at least
          </label>
          <input
            id="wants-beds"
            className={FIELD}
            inputMode="decimal"
            defaultValue={wants.minBeds === undefined ? '' : String(wants.minBeds)}
            onBlur={(event) => {
              const beds = Number(event.target.value)
              const { minBeds: _cleared, ...rest } = wants
              update({
                homeWants: {
                  ...rest,
                  ...(Number.isFinite(beds) && beds > 0 ? { minBeds: Math.round(beds) } : {}),
                },
              })
            }}
          />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="wants-radius">
          Within {wants.radiusMetres} m
        </label>
        <input
          id="wants-radius"
          type="range"
          min={400}
          max={3000}
          step={100}
          className="w-full"
          value={wants.radiusMetres}
          onChange={(event) => {
            update({ homeWants: { ...wants, radiusMetres: Number(event.target.value) } })
          }}
        />
      </div>
    </Card>
  )
}

export function HomesPage() {
  const homes = useHomes()
  const [adding, setAdding] = useState(false)

  const rows = homes.data ?? []

  return (
    /*
      The wrapper for the same reason Today has one: the card below states
      no margin, and the sections after it space themselves at 2rem. It
      was reaching for `mb-3` at the call site and landing at 12 pixels
      against their 32, so the limitation read as attached to the heading
      above it rather than as a block of its own.
    */
    <div className="space-y-8">
      <PageHeader title="Houses" subtitle="What you are considering, and what is around it" />

      {/*
        The limitation, stated where somebody will meet it rather than
        left to be discovered. Zillow, Redfin and Realtor.com were tested
        and none of them can be read from a browser — a search box that
        never found anything would be worse than saying so.
      */}
      <Card>
        <p className="text-ink-300 text-sm">
          Listing sites cannot be searched from here — none of them allow it. Paste a house in and
          the app does the part it can: it places the address, asks OpenStreetMap what is within
          walking distance, and scores it against what you said you wanted.
        </p>
      </Card>

      <Section title="What you want" description="Scores every house against the same thing.">
        <Wants />
      </Section>

      <Section
        title="Candidates"
        description="Best first. Nothing is ever hidden for scoring badly."
        action={
          <Button
            variant={adding ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => {
              setAdding(!adding)
            }}
          >
            {adding ? 'Close' : 'Add'}
          </Button>
        }
      >
        {adding && (
          <AddHouse
            onDone={() => {
              setAdding(false)
            }}
          />
        )}

        {homes.data !== undefined && rows.length === 0 && !adding && (
          <Card>
            <Empty title="Nothing yet">
              Add a house you have found somewhere else. It becomes something to compare rather than
              a tab you meant to come back to.
            </Empty>
          </Card>
        )}

        <div className="space-y-3">
          {rows.map(({ candidate, scored }) => (
            <HouseRow key={candidate.id} candidate={candidate} scored={scored} />
          ))}
        </div>

        {/*
          The honest limit on the measurement itself. A dense city is
          mapped in detail and a rural county is not, so a low count
          means either "nothing there" or "nobody mapped it" and this
          cannot tell which.
        */}
        {rows.some(({ candidate }) => candidate.neighbourhood !== undefined) && (
          <p className="text-ink-700 mt-3 text-xs">
            Counts come from OpenStreetMap, which is mapped unevenly — two addresses in the same
            town compare fairly, one in a city against one in the country does not.
          </p>
        )}
      </Section>
    </div>
  )
}
