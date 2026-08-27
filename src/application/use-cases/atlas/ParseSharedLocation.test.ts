import { describe, expect, it } from 'vitest'
import { parseSharedLocation } from './ParseSharedLocation'

describe('parseSharedLocation — Google Maps', () => {
  const full =
    'https://www.google.com/maps/place/Blue+Bottle+Coffee/@37.8010,-122.2730,17z/data=!3m1!4b1!4m6!3m5!1s0x808f8/!8m2!3d37.8012551!4d-122.273941'

  it('prefers the place point over the map viewport', () => {
    const result = parseSharedLocation(full)

    expect(result.source).toBe('google')
    expect(result.name).toBe('Blue Bottle Coffee')
    // !3d/!4d, not the @-viewport, which is a different point
    expect(result.coordinates).toEqual({ latitude: 37.8012551, longitude: -122.273941 })
  })

  it('falls back to the viewport when there is no place point', () => {
    const result = parseSharedLocation('https://www.google.com/maps/@37.81,-122.27,15z')

    expect(result.coordinates).toEqual({ latitude: 37.81, longitude: -122.27 })
  })

  it('reads a coordinate pair from ?q=', () => {
    const result = parseSharedLocation('https://maps.google.com/?q=37.8,-122.27')

    expect(result.coordinates).toEqual({ latitude: 37.8, longitude: -122.27 })
  })

  it('treats a non-coordinate ?q= as a name', () => {
    const result = parseSharedLocation(
      'https://www.google.com/maps/search/?api=1&query=Blue%20Bottle%20Coffee',
    )

    expect(result.name).toBe('Blue Bottle Coffee')
    expect(result.coordinates).toBeUndefined()
  })

  it('flags a short link as needing a redirect it cannot follow', () => {
    const result = parseSharedLocation('https://maps.app.goo.gl/abc123')

    expect(result.needsRedirect).toBe(true)
    expect(result.coordinates).toBeUndefined()
  })

  it('takes the name from Android share text above a short link', () => {
    const result = parseSharedLocation('Blue Bottle Coffee\nhttps://maps.app.goo.gl/abc123')

    expect(result.name).toBe('Blue Bottle Coffee')
    expect(result.needsRedirect).toBe(true)
  })

  it('keeps the original url', () => {
    expect(parseSharedLocation(full).url).toContain('google.com/maps/place')
  })
})

describe('parseSharedLocation — other sources', () => {
  it('reads an Apple Maps link', () => {
    const result = parseSharedLocation('https://maps.apple.com/?ll=37.8,-122.27&q=Blue%20Bottle')

    expect(result.source).toBe('apple')
    expect(result.name).toBe('Blue Bottle')
    expect(result.coordinates).toEqual({ latitude: 37.8, longitude: -122.27 })
  })

  it('reads an OpenStreetMap marker link', () => {
    const result = parseSharedLocation(
      'https://www.openstreetmap.org/?mlat=37.8&mlon=-122.27#map=16/37.8/-122.27',
    )

    expect(result.source).toBe('osm')
    expect(result.coordinates).toEqual({ latitude: 37.8, longitude: -122.27 })
  })

  it('reads a geo: URI', () => {
    const result = parseSharedLocation('geo:37.8,-122.27?q=something')

    expect(result.source).toBe('geo')
    expect(result.coordinates).toEqual({ latitude: 37.8, longitude: -122.27 })
  })

  it('reads a bare coordinate pair', () => {
    const result = parseSharedLocation('  37.8012, -122.2739 ')

    expect(result.source).toBe('coordinates')
    expect(result.coordinates).toEqual({ latitude: 37.8012, longitude: -122.2739 })
  })

  it('keeps the name from an unrecognised link so it can still be searched', () => {
    const result = parseSharedLocation('Some Bar\nhttps://example.com/venue/123')

    expect(result.source).toBe('unknown')
    expect(result.name).toBe('Some Bar')
  })
})

describe('parseSharedLocation — non-shares', () => {
  it('returns nothing for ordinary search text', () => {
    expect(parseSharedLocation('blue bottle coffee')).toEqual({
      source: 'unknown',
      needsRedirect: false,
    })
  })

  it('returns nothing for empty input', () => {
    expect(parseSharedLocation('   ')).toEqual({
      source: 'unknown',
      needsRedirect: false,
    })
  })

  it('rejects a coordinate pair outside the valid range', () => {
    expect(parseSharedLocation('200.0, -122.27').coordinates).toBeUndefined()
  })

  it('does not mistake a plain number pair in prose for coordinates', () => {
    expect(parseSharedLocation('table for 2, party of 4').coordinates).toBeUndefined()
  })
})

describe('parseSharedLocation — a geo: URI as a share sheet sends it', () => {
  /*
   * The shape that actually arrives. A `geo:` URI on its own line under a
   * name is how Android hands a location to an app that is not a maps app,
   * and reading it required dropping an anchor that only ever matched the
   * machine-generated case.
   */
  it('reads a URI that has a name above it', () => {
    const result = parseSharedLocation('The bench\ngeo:51.5074,-0.1278')

    expect(result.source).toBe('geo')
    expect(result.name).toBe('The bench')
    expect(result.coordinates).toMatchObject({ latitude: 51.5074 })
  })

  /*
   * `geo:0,0?q=…` is the documented idiom, and the leading pair really is a
   * placeholder. Trusting it would drop a pin in the Gulf of Guinea — which
   * is a plausible-looking answer rather than an obviously wrong one, so
   * nothing downstream would flag it.
   */
  it('prefers the query over a 0,0 placeholder', () => {
    const result = parseSharedLocation('geo:0,0?q=51.5129,-0.1345(Kiln)')

    expect(result.coordinates).toMatchObject({ latitude: 51.5129, longitude: -0.1345 })
    expect(result.name).toBe('Kiln')
  })

  it('does not leave the URI inside the name', () => {
    expect(parseSharedLocation('The bench\ngeo:51.5,-0.1').name).not.toMatch(/geo:/)
  })
})
