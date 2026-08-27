import { describe, expect, it, vi } from 'vitest'
import { isErr, isOk } from '@/domain/atlas/shared/Result'
import { NominatimSearchProvider } from './nominatim-search'
import type { FetchLike } from './nominatim-search'

const cafeItem = {
  place_id: 12345,
  lat: '37.8044',
  lon: '-122.2712',
  name: 'Blue Bottle Coffee',
  display_name: 'Blue Bottle Coffee, 300 Webster Street, Oakland, California, USA',
  category: 'amenity',
  type: 'cafe',
  address: {
    house_number: '300',
    road: 'Webster Street',
    city: 'Oakland',
    state: 'California',
    country: 'United States',
  },
  extratags: { website: 'https://bluebottlecoffee.com', phone: '+1 510 555 0100' },
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

/** `minIntervalMs: 0` skips the real-time politeness delay in tests. */
function provider(fetchFn: FetchLike) {
  return new NominatimSearchProvider({ fetch: fetchFn, minIntervalMs: 0 })
}

describe('NominatimSearchProvider', () => {
  it('maps a result onto the provider-neutral shape', async () => {
    const fetchFn = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse([cafeItem])))

    const result = await provider(fetchFn).search({ text: 'blue bottle' })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toEqual([
        {
          providerId: 'nominatim',
          providerPlaceId: '12345',
          name: 'Blue Bottle Coffee',
          displayName: 'Blue Bottle Coffee, 300 Webster Street, Oakland, California, USA',
          address: '300 Webster Street',
          city: 'Oakland',
          state: 'California',
          country: 'United States',
          coordinates: { latitude: 37.8044, longitude: -122.2712 },
          categoryHints: ['amenity', 'cafe'],
          website: 'https://bluebottlecoffee.com',
          phone: '+1 510 555 0100',
        },
      ])
    }
  })

  it('sends the query and the standard parameters', async () => {
    const fetchFn = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse([])))

    await provider(fetchFn).search({ text: 'ramen', limit: 3 })

    const url = new URL(fetchFn.mock.calls[0]?.[0] ?? '')
    expect(url.searchParams.get('q')).toBe('ramen')
    expect(url.searchParams.get('format')).toBe('jsonv2')
    expect(url.searchParams.get('addressdetails')).toBe('1')
    expect(url.searchParams.get('limit')).toBe('3')
    expect(url.searchParams.get('viewbox')).toBeNull()
  })

  it('biases results around a nearby point without excluding distant ones', async () => {
    const fetchFn = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse([])))

    await provider(fetchFn).search({
      text: 'ramen',
      near: { latitude: 40, longitude: -74 },
    })

    const url = new URL(fetchFn.mock.calls[0]?.[0] ?? '')
    expect(url.searchParams.get('viewbox')).toBe('-74.5,40.5,-73.5,39.5')
    expect(url.searchParams.get('bounded')).toBe('0')
  })

  it('does not call the network for a blank query', async () => {
    const fetchFn = vi.fn<FetchLike>(() => Promise.resolve(jsonResponse([])))

    const result = await provider(fetchFn).search({ text: '   ' })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(isOk(result) && result.value).toEqual([])
  })

  it('falls back to the first part of the display name when there is no name', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(
        jsonResponse([
          { ...cafeItem, name: undefined, display_name: 'Pier 39, San Francisco, USA' },
        ]),
      ),
    )

    const result = await provider(fetchFn).search({ text: 'pier 39' })

    expect(isOk(result) && result.value[0]?.name).toBe('Pier 39')
  })

  it('skips malformed entries instead of failing the whole search', async () => {
    const fetchFn = vi.fn<FetchLike>(() =>
      Promise.resolve(jsonResponse([{ lat: 'not a number', lon: '1' }, 'nonsense', cafeItem])),
    )

    const result = await provider(fetchFn).search({ text: 'blue bottle' })

    expect(isOk(result) && result.value).toHaveLength(1)
  })

  it('reports rate limiting distinctly from other provider errors', async () => {
    const limited = await provider(() => Promise.resolve(jsonResponse([], 429))).search({
      text: 'x',
    })
    const broken = await provider(() => Promise.resolve(jsonResponse([], 500))).search({
      text: 'x',
    })

    expect(isErr(limited) && limited.error.code).toBe('rate-limited')
    expect(isErr(broken) && broken.error.code).toBe('provider-error')
  })

  it('reports a network failure as an error rather than throwing', async () => {
    const result = await provider(() => Promise.reject(new Error('offline'))).search({
      text: 'x',
    })

    expect(isErr(result) && result.error.code).toBe('network')
  })

  it('reports an aborted search distinctly so the UI can ignore it', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'

    const result = await provider(() => Promise.reject(abortError)).search({ text: 'x' })

    expect(isErr(result) && result.error.code).toBe('aborted')
  })

  it('rejects a payload that is not a list of results', async () => {
    const result = await provider(() => Promise.resolve(jsonResponse({ error: 'nope' }))).search({
      text: 'x',
    })

    expect(isErr(result) && result.error.code).toBe('provider-error')
  })
})
