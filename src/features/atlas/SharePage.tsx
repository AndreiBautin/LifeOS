import { MapPin } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { ATLAS_CATEGORIES } from '@/application/use-cases/atlas/atlas'
import { parseSharedLocation } from '@/application/use-cases/atlas/ParseSharedLocation'
import { Button, Card, Section } from '@/components/shared/primitives'
import type { CategoryId } from '@/domain/atlas/category/CategoryDefinition'

import { useAddSharedLocation } from './hooks'

/**
 * Where a location shared from a maps app lands.
 *
 * Registered as the app's share target, so "Share → Lift" from Google Maps
 * arrives here as query parameters rather than requiring a copy and a
 * paste. It is also reachable by hand and accepts a pasted link, which is
 * the only route on a desktop browser and the fallback when the share
 * sheet hands over something odd.
 *
 * It is a form rather than a straight save for one reason that cannot be
 * designed away: no share carries a category, and a place needs one. Given
 * a form is unavoidable, the name is editable too — which is what makes a
 * `geo:` URI, all coordinates and no name, savable at all.
 *
 * Everything here is local. The parse is regular expressions over the
 * text; nothing is sent anywhere, which is the same promise the rest of
 * the hub makes.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

/**
 * The share sheet spreads one location over three parameters and is not
 * consistent about which. Android usually puts the name in `text` and the
 * link in `url`; some apps put both in `text` and leave `url` empty. Joined
 * rather than picked, because the parser wants the name *and* the link and
 * is happy to read them out of one blob.
 */
function sharedText(params: URLSearchParams): string {
  const parts = [params.get('title'), params.get('text'), params.get('url')]
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')

  // Google Maps sends the same name as both `title` and `text`, and showing
  // somebody their own place name twice in a box they are asked to check
  // reads as the app having got confused.
  return [...new Set(parts)].join('\n')
}

export function SharePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const add = useAddSharedLocation()

  const [text, setText] = useState(() => sharedText(params))
  const [categoryId, setCategoryId] = useState<string>(ATLAS_CATEGORIES[0]?.id ?? '')

  const parsed = useMemo(() => parseSharedLocation(text), [text])
  const [name, setName] = useState<string | undefined>(undefined)
  const effectiveName = name ?? parsed.name ?? ''

  const point = parsed.coordinates

  return (
    <Section
      title="Save a shared place"
      description="Paste a link from Google Maps, Apple Maps or OpenStreetMap — or a pair of coordinates."
    >
      <Card>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            add.mutate(
              { text, categoryId: categoryId as CategoryId, name: effectiveName },
              {
                onSuccess: (result) => {
                  if (result.place !== undefined) void navigate('/map')
                },
              },
            )
          }}
        >
          <label className="block">
            <span className={LABEL}>Shared text or link</span>
            <textarea
              className={`${FIELD} h-24 resize-none py-2`}
              value={text}
              placeholder="https://maps.app.goo.gl/…"
              onChange={(event) => {
                setText(event.target.value)
              }}
            />
          </label>

          <label className="block">
            <span className={LABEL}>Name</span>
            <input
              className={FIELD}
              value={effectiveName}
              placeholder="What to call it"
              onChange={(event) => {
                setName(event.target.value)
              }}
            />
          </label>

          <label className="block">
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

          <p className="text-ink-500 numeric text-xs">
            {point === undefined
              ? parsed.needsRedirect
                ? 'That short link only resolves on a server, so there is no point in it to read. It saves under its name and can be placed on the map later.'
                : 'No coordinates in that — it saves as a name you can place later.'
              : `Found ${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)} · ${parsed.source}`}
          </p>

          {add.data?.error !== undefined && (
            <p role="alert" className="text-bad-500 text-sm">
              {add.data.error}
            </p>
          )}

          <Button type="submit" variant="primary" full disabled={add.isPending}>
            <MapPin size={16} aria-hidden />
            Save it
          </Button>
        </form>
      </Card>
    </Section>
  )
}
