import type {
  PlaceSearchError,
  PlaceSearchProvider,
  PlaceSearchQuery,
  PlaceSearchResult,
} from '@/domain/atlas/PlaceSearch'
import { createCoordinates } from '@/domain/atlas/place/Coordinates'
import { err, ok, type Result } from '@/domain/atlas/shared/Result'

const DEFAULT_ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const DEFAULT_LIMIT = 8

/**
 * Nominatim's usage policy caps anonymous clients at one request per second.
 * The UI debounces typing, but the floor is enforced here too so no caller can
 * accidentally violate the policy — this adapter is the thing that knows the
 * rule, not its consumers.
 */
const DEFAULT_MIN_INTERVAL_MS = 1000

/** The slice of `fetch` this adapter uses, so tests can pass a plain function. */
export type FetchLike = (
  input: string,
  init?: { readonly signal?: AbortSignal | undefined },
) => Promise<Response>

export interface NominatimSearchProviderOptions {
  readonly fetch?: FetchLike | undefined
  readonly endpoint?: string | undefined
  readonly minIntervalMs?: number | undefined
  /** Degrees of latitude/longitude to bias around `near`. */
  readonly viewboxRadiusDegrees?: number
}

interface NominatimAddress {
  readonly house_number?: string
  readonly road?: string
  readonly city?: string
  readonly town?: string
  readonly village?: string
  readonly hamlet?: string
  readonly municipality?: string
  readonly suburb?: string
  readonly state?: string
  readonly region?: string
  readonly country?: string
}

interface NominatimItem {
  readonly place_id?: unknown
  readonly lat?: unknown
  readonly lon?: unknown
  readonly name?: unknown
  readonly display_name?: unknown
  readonly category?: unknown
  readonly type?: unknown
  readonly address?: unknown
  readonly extratags?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function cityOf(address: NominatimAddress): string | undefined {
  return (
    address.city ??
    address.town ??
    address.village ??
    address.hamlet ??
    address.municipality ??
    address.suburb
  )
}

function streetOf(address: NominatimAddress): string | undefined {
  if (address.road === undefined) return undefined
  return address.house_number === undefined
    ? address.road
    : `${address.house_number} ${address.road}`
}

function toSearchResult(raw: unknown): PlaceSearchResult | undefined {
  if (!isRecord(raw)) return undefined
  const item = raw as NominatimItem

  const latitude = toNumber(item.lat)
  const longitude = toNumber(item.lon)
  if (latitude === undefined || longitude === undefined) return undefined

  const coordinatesResult = createCoordinates(latitude, longitude)
  if (!coordinatesResult.ok) return undefined

  const displayName = asString(item.display_name)
  // A result with nothing to call it is not worth offering to the user.
  const name = asString(item.name) ?? displayName?.split(',')[0]?.trim()
  if (name === undefined || displayName === undefined) return undefined

  const address = (isRecord(item.address) ? item.address : {}) as NominatimAddress
  const extratags = isRecord(item.extratags) ? item.extratags : {}

  const hints = [asString(item.category), asString(item.type)].filter(
    (hint): hint is string => hint !== undefined,
  )

  // Nominatim usually supplies place_id, but the point itself is a stable
  // enough fallback identity for list keys and de-duplication.
  const providerPlaceId =
    typeof item.place_id === 'number' || typeof item.place_id === 'string'
      ? String(item.place_id)
      : `${String(latitude)},${String(longitude)}`

  return {
    providerId: 'nominatim',
    providerPlaceId,
    name,
    displayName,
    address: streetOf(address),
    city: cityOf(address),
    state: address.state ?? address.region,
    country: address.country,
    coordinates: coordinatesResult.value,
    categoryHints: hints,
    website: asString(extratags.website) ?? asString(extratags['contact:website']),
    phone: asString(extratags.phone) ?? asString(extratags['contact:phone']),
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Free, key-free geocoding over OpenStreetMap. Good at addresses, landmarks
 * and well-mapped POIs; weaker on business names than a commercial provider,
 * which is the trade for needing no account, no billing and no API key.
 *
 * Nominatim identifies clients by `Referer`, which browsers set automatically
 * and refuse to let scripts override — so, unlike a server-side client, there
 * is no `User-Agent` header to set here.
 */
export class NominatimSearchProvider implements PlaceSearchProvider {
  readonly id = 'nominatim'

  private readonly fetchFn: FetchLike
  private readonly endpoint: string
  private readonly minIntervalMs: number
  private readonly viewboxRadiusDegrees: number
  private nextSlotAt = 0

  constructor(options: NominatimSearchProviderOptions = {}) {
    this.fetchFn =
      options.fetch ??
      // Spread rather than passed through: `RequestInit.signal` does not
      // accept an explicit `undefined` under `exactOptionalPropertyTypes`,
      // and an unset signal is an absent key rather than an undefined one.
      ((input, init) => fetch(input, init?.signal === undefined ? {} : { signal: init.signal }))
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT
    this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
    this.viewboxRadiusDegrees = options.viewboxRadiusDegrees ?? 0.5
  }

  async search(
    query: PlaceSearchQuery,
  ): Promise<Result<readonly PlaceSearchResult[], PlaceSearchError>> {
    const text = query.text.trim()
    if (text.length === 0) {
      return ok([])
    }

    await this.waitForSlot()
    if (query.signal?.aborted === true) {
      return err({ code: 'aborted', message: 'Search was cancelled.' })
    }

    let response: Response
    try {
      response = await this.fetchFn(this.buildUrl(text, query), {
        signal: query.signal,
      })
    } catch (cause) {
      if (isAbortError(cause)) {
        return err({ code: 'aborted', message: 'Search was cancelled.' })
      }
      return err({ code: 'network', message: 'Could not reach the search service.' })
    }

    if (response.status === 429) {
      return err({
        code: 'rate-limited',
        message: 'Too many searches at once — try again in a moment.',
      })
    }
    if (!response.ok) {
      return err({
        code: 'provider-error',
        message: `Search failed (${String(response.status)}).`,
      })
    }

    let payload: unknown
    try {
      payload = (await response.json()) as unknown
    } catch {
      return err({ code: 'provider-error', message: 'Search returned invalid data.' })
    }

    if (!Array.isArray(payload)) {
      return err({ code: 'provider-error', message: 'Search returned invalid data.' })
    }

    // A single malformed entry shouldn't blank the whole result list.
    return ok(
      payload
        .map(toSearchResult)
        .filter((result): result is PlaceSearchResult => result !== undefined),
    )
  }

  private buildUrl(text: string, query: PlaceSearchQuery): string {
    const params = new URLSearchParams({
      q: text,
      format: 'jsonv2',
      addressdetails: '1',
      extratags: '1',
      limit: String(query.limit ?? DEFAULT_LIMIT),
    })

    if (query.near) {
      const radius = this.viewboxRadiusDegrees
      const { latitude, longitude } = query.near
      // viewbox biases ranking towards the user; `bounded=0` keeps far-away
      // matches available rather than hiding them entirely.
      params.set(
        'viewbox',
        [longitude - radius, latitude + radius, longitude + radius, latitude - radius]
          .map((value) => String(value))
          .join(','),
      )
      params.set('bounded', '0')
    }

    return `${this.endpoint}?${params.toString()}`
  }

  private async waitForSlot(): Promise<void> {
    if (this.minIntervalMs <= 0) return

    const now = Date.now()
    const waitMs = Math.max(0, this.nextSlotAt - now)
    this.nextSlotAt = Math.max(now, this.nextSlotAt) + this.minIntervalMs
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }
}
