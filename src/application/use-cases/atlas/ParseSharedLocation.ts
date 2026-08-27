import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import { createCoordinates } from '@/domain/atlas/place/Coordinates'

export type SharedLocationSource = 'google' | 'apple' | 'osm' | 'geo' | 'coordinates' | 'unknown'

/**
 * The optional fields here accept an explicit `undefined`, which the stored
 * records deliberately do not.
 *
 * The difference is that this never reaches IndexedDB. It is a parse result
 * handed straight to a form — so the distinction between an absent key and
 * one holding `undefined`, which the store would preserve and which every
 * saved record is careful about, has nowhere to survive to. Writing it the
 * strict way would mean a conditional spread at every one of a dozen return
 * sites to describe something nobody can observe.
 */
export interface SharedLocation {
  readonly name?: string | undefined
  readonly coordinates?: Coordinates | undefined
  /** The URL the text carried, if any — worth keeping on the saved place. */
  readonly url?: string | undefined
  readonly source: SharedLocationSource
  /**
   * True for links whose target only exists behind an HTTP redirect, which a
   * browser cannot follow cross-origin. The name, if there is one, is all we
   * can act on — search for it instead.
   */
  readonly needsRedirect: boolean
}

const NOT_A_SHARE: SharedLocation = { source: 'unknown', needsRedirect: false }

const URL_PATTERN = /https?:\/\/\S+/i
const SHORT_GOOGLE = /(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i

/** Google embeds the place's own point as `!3d<lat>!4d<lng>`. */
const GOOGLE_PLACE_POINT = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/
/** `@lat,lng,zoom` is the map viewport, not the place — a weaker fallback. */
const GOOGLE_VIEWPORT = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/
const GOOGLE_PLACE_NAME = /\/maps\/place\/([^/@?]+)/
/*
 * Deliberately not anchored. A `geo:` URI arrives on its own only when
 * something machine-generated sent it; a share sheet sends "Name" on one
 * line and the URI on the next, which an anchored pattern reads as not a
 * share at all.
 */
const GEO_URI = /geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(\S*)/i
/**
 * The Android idiom: `geo:0,0?q=<lat>,<lng>(<Label>)`. The leading pair is
 * a placeholder in that form, so the point and the name both live in the
 * query — reading only the pair puts you in the middle of the Atlantic.
 */
const GEO_QUERY = /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\s*\(([^)]*)\))?/i
const BARE_COORDINATES = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

function toCoordinates(lat: string, lon: string): Coordinates | undefined {
  const result = createCoordinates(Number(lat), Number(lon))
  return result.ok ? result.value : undefined
}

/** A `q=`/`query=`/`ll=` value is sometimes a point and sometimes a name. */
function coordinatesFromPair(value: string | null): Coordinates | undefined {
  if (value === null) return undefined
  const match = BARE_COORDINATES.exec(value)
  return match?.[1] !== undefined && match[2] !== undefined
    ? toCoordinates(match[1], match[2])
    : undefined
}

function cleanName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    // Malformed percent-encoding: fall back to the raw text rather than throw.
  }
  const name = decoded.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim()
  return name.length > 0 ? name : undefined
}

/**
 * Whatever is left once the links are stripped out — how Android shares a
 * place, as "Name\n<link>".
 *
 * Deliberately not line-based: a single-line `<input>` cannot hold newlines,
 * so pasting that share into the search box collapses it to "Name <link>" on
 * one line. Removing URLs handles both shapes.
 */
function nameFromSharedText(text: string): string | undefined {
  const withoutUrls = text
    .replace(/https?:\/\/\S+/gi, ' ')
    // `geo:` is a URI too, and one that would otherwise end up inside the
    // name — a place called "The bench geo:51.5,-0.1".
    .replace(/geo:\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return withoutUrls.length > 0 ? withoutUrls : undefined
}

function parseGoogle(url: URL, raw: string, sharedName?: string): SharedLocation {
  const placePoint = GOOGLE_PLACE_POINT.exec(raw)
  const viewport = GOOGLE_VIEWPORT.exec(raw)
  const params = url.searchParams

  const coordinates =
    (placePoint?.[1] !== undefined && placePoint[2] !== undefined
      ? toCoordinates(placePoint[1], placePoint[2])
      : undefined) ??
    coordinatesFromPair(params.get('q')) ??
    coordinatesFromPair(params.get('query')) ??
    (viewport?.[1] !== undefined && viewport[2] !== undefined
      ? toCoordinates(viewport[1], viewport[2])
      : undefined)

  const pathName = GOOGLE_PLACE_NAME.exec(url.pathname)?.[1]
  const name =
    cleanName(pathName) ??
    sharedName ??
    (coordinatesFromPair(params.get('q')) === undefined
      ? (cleanName(params.get('q') ?? undefined) ?? cleanName(params.get('query') ?? undefined))
      : undefined)

  return {
    name,
    coordinates,
    url: url.toString(),
    source: 'google',
    needsRedirect: coordinates === undefined && SHORT_GOOGLE.test(url.host + url.pathname),
  }
}

function parseApple(url: URL, sharedName?: string): SharedLocation {
  const params = url.searchParams
  const coordinates =
    coordinatesFromPair(params.get('ll')) ?? coordinatesFromPair(params.get('sll'))
  const name =
    cleanName(params.get('q') ?? undefined) ??
    cleanName(params.get('address') ?? undefined) ??
    sharedName
  return { name, coordinates, url: url.toString(), source: 'apple', needsRedirect: false }
}

function parseOsm(url: URL, sharedName?: string): SharedLocation {
  const params = url.searchParams
  const lat = params.get('mlat')
  const lon = params.get('mlon')
  const coordinates = lat !== null && lon !== null ? toCoordinates(lat, lon) : undefined
  return {
    name: sharedName,
    coordinates,
    url: url.toString(),
    source: 'osm',
    needsRedirect: false,
  }
}

/**
 * Pulls whatever is usable out of a pasted map link or share text.
 *
 * Short Google links (`maps.app.goo.gl`) are the awkward case: the real URL
 * only exists behind a redirect, and the browser cannot follow one
 * cross-origin. Android's share text usually includes the place name above
 * the link, so that name is extracted and flagged with `needsRedirect` for
 * the caller to search instead.
 */
export function parseSharedLocation(text: string): SharedLocation {
  const trimmed = text.trim()
  if (trimmed.length === 0) return NOT_A_SHARE

  const geo = GEO_URI.exec(trimmed)
  if (geo?.[1] !== undefined && geo[2] !== undefined) {
    const query = GEO_QUERY.exec(geo[3] ?? '')
    const coordinates =
      (query?.[1] !== undefined && query[2] !== undefined
        ? toCoordinates(query[1], query[2])
        : undefined) ?? toCoordinates(geo[1], geo[2])

    if (coordinates !== undefined) {
      const name = cleanName(query?.[3]) ?? nameFromSharedText(trimmed)
      return {
        ...(name === undefined ? {} : { name }),
        coordinates,
        source: 'geo',
        needsRedirect: false,
      }
    }
  }

  const bare = BARE_COORDINATES.exec(trimmed)
  if (bare?.[1] !== undefined && bare[2] !== undefined) {
    const coordinates = toCoordinates(bare[1], bare[2])
    if (coordinates) return { coordinates, source: 'coordinates', needsRedirect: false }
  }

  const rawUrl = URL_PATTERN.exec(trimmed)?.[0]
  if (rawUrl === undefined) return NOT_A_SHARE

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return NOT_A_SHARE
  }

  const sharedName = nameFromSharedText(trimmed)
  const host = url.host.toLowerCase()

  if (host.includes('google.') || SHORT_GOOGLE.test(rawUrl)) {
    return parseGoogle(url, rawUrl, sharedName)
  }
  if (host.includes('maps.apple.com')) {
    return parseApple(url, sharedName)
  }
  if (host.includes('openstreetmap.org')) {
    return parseOsm(url, sharedName)
  }

  return { name: sharedName, url: rawUrl, source: 'unknown', needsRedirect: false }
}
