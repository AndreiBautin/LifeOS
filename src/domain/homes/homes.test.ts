import { describe, expect, it } from 'vitest'

import { asHomeCandidateId } from '@/domain/ids/ids'

import { DEFAULT_WANTS, parseWants, ranked, scoreCandidate, type HomeCandidate } from './candidate'
import {
  EMPTY_COUNTS,
  kindOf,
  NEARBY_KINDS,
  overpassQuery,
  readNeighbourhood,
  type NearbyKind,
} from './neighbourhood'

function candidate(address: string, extra: Partial<HomeCandidate> = {}): HomeCandidate {
  return {
    id: asHomeCandidateId(address),
    address,
    standing: 'considering',
    createdAt: '2026-08-01T09:00:00',
    ...extra,
  }
}

/**
 * A reading. `asked` defaults to everything, because most of these
 * tests are about the counting rather than about what was queried.
 */
function hood(
  counts: Partial<Record<NearbyKind, number>>,
  asked: readonly NearbyKind[] = NEARBY_KINDS,
) {
  return {
    counts: { ...EMPTY_COUNTS, ...counts },
    asked,
    radiusMetres: 1500,
    readAt: '2026-08-31T10:00:00Z',
  }
}

/*
 * Shapes taken from a live Overpass response. A `way` carries a `center`
 * rather than a `lat`/`lon`, and every element that matched carries the
 * tags that made it match.
 */
const OVERPASS = {
  version: 0.6,
  elements: [
    { type: 'node', id: 1, tags: { shop: 'supermarket', name: 'Corner Market' } },
    { type: 'way', id: 2, center: { lat: 40.74, lon: -73.98 }, tags: { leisure: 'park' } },
    { type: 'node', id: 3, tags: { amenity: 'school' } },
    { type: 'node', id: 4, tags: { highway: 'bus_stop' } },
    { type: 'node', id: 5, tags: { amenity: 'cafe' } },
    // Untagged, or tagged with something nobody asked for.
    { type: 'node', id: 6 },
    { type: 'node', id: 7, tags: { amenity: 'bench' } },
  ],
}

describe('reading what is around a point', () => {
  it('counts each element under the kind its tags name', () => {
    const counts = readNeighbourhood(OVERPASS, 1500, 'x').counts

    expect(counts.groceries).toBe(1)
    expect(counts.parks).toBe(1)
    expect(counts.schools).toBe(1)
    expect(counts.transit).toBe(1)
    expect(counts.cafes).toBe(1)
  })

  /*
   * A query returns what it asked for and occasionally a little more.
   * Guessing at an untagged node would put a number on the screen that
   * nothing produced.
   */
  it('drops what it does not recognise rather than guessing', () => {
    const total = Object.values(readNeighbourhood(OVERPASS, 1500, 'x').counts).reduce(
      (a, b) => a + b,
      0,
    )

    expect(total).toBe(5)
  })

  /*
   * Overpass returns one flat list and does not say which clause
   * matched, so overlapping tags have to resolve to a single kind or a
   * hospital café would be counted twice.
   */
  it('gives an element exactly one kind when its tags overlap', () => {
    expect(kindOf({ amenity: 'hospital', name: 'x' })).toBe('healthcare')
    expect(kindOf({ leisure: 'park', amenity: 'cafe' })).toBe('parks')
  })

  it('says nothing about a payload of the wrong shape', () => {
    expect(readNeighbourhood(undefined, 1500, 'x').counts).toEqual(EMPTY_COUNTS)
    expect(readNeighbourhood({ elements: 'nope' }, 1500, 'x').counts).toEqual(EMPTY_COUNTS)
  })

  it('records the radius, because a count means nothing without one', () => {
    expect(readNeighbourhood(OVERPASS, 800, 'x').radiusMetres).toBe(800)
  })
})

describe('the query', () => {
  /*
   * Measured: all eight kinds around a Manhattan address returned 2,300
   * elements in 13.4 seconds and sometimes timed out entirely; the three
   * defaults took 1.8. Asking for what nothing will read is the waste
   * the restraint towards Nominatim exists to prevent.
   */
  it('asks only for the kinds wanted', () => {
    const three = overpassQuery(40.74, -73.98, 1500, ['groceries', 'parks', 'transit'])

    expect(three).toContain('shop=supermarket')
    expect(three).not.toContain('amenity=restaurant')
  })

  it('asks for every kind when none is named', () => {
    expect(overpassQuery(40.74, -73.98, 1500)).toContain('amenity=restaurant')
  })

  it('carries the radius and the point', () => {
    expect(overpassQuery(40.74, -73.98, 900, ['parks'])).toContain('around:900,40.74,-73.98')
  })

  // The geometry of every park boundary is tens of kilobytes and nothing
  // here draws them.
  it('asks for tags rather than geometry', () => {
    expect(overpassQuery(40.74, -73.98, 900, ['parks'])).toContain('out tags center')
  })
})

describe('scoring a house against what you want', () => {
  const wants = { ...DEFAULT_WANTS, maxPriceMinor: 40_000_000, minBeds: 3 }

  it('gives full marks inside the budget, and no more for being cheap', () => {
    const atBudget = scoreCandidate(candidate('A', { priceMinor: 40_000_000 }), wants)
    const halfBudget = scoreCandidate(candidate('B', { priceMinor: 20_000_000 }), wants)

    expect(atBudget.score).toBe(halfBudget.score)
  })

  /*
   * Ten percent over is a conversation and double is not, so going over
   * loses points in proportion rather than all at once.
   */
  it('loses points in proportion to how far over budget it is', () => {
    const bit = scoreCandidate(candidate('A', { priceMinor: 44_000_000 }), wants).score
    const lot = scoreCandidate(candidate('B', { priceMinor: 80_000_000 }), wants).score

    expect(bit).toBeGreaterThan(lot)
  })

  it('explains every point it gave', () => {
    const scored = scoreCandidate(
      candidate('A', { priceMinor: 30_000_000, beds: 4, neighbourhood: hood({ groceries: 5 }) }),
      wants,
    )

    expect(scored.reasons.some((one) => one.text === 'Within budget')).toBe(true)
    expect(scored.reasons.some((one) => one.text.includes('4 bedrooms'))).toBe(true)
    expect(scored.reasons.some((one) => one.text.includes('5 groceries'))).toBe(true)
  })

  /*
   * Three supermarkets is a well-served address and the thirtieth adds
   * nothing. A raw count would rank a dense city centre above everywhere
   * else on every kind, which is a fact about density rather than about
   * whether the address suits you.
   */
  it('stops rewarding density past the point of being well served', () => {
    const three = scoreCandidate(
      candidate('A', { neighbourhood: hood({ groceries: 3, parks: 3, transit: 3 }) }),
      wants,
    )
    const thirty = scoreCandidate(
      candidate('B', { neighbourhood: hood({ groceries: 30, parks: 40, transit: 90 }) }),
      wants,
    )

    expect(three.score).toBe(thirty.score)
  })

  it('gives partial credit below that, because one shop beats none', () => {
    const one = scoreCandidate(candidate('A', { neighbourhood: hood({ groceries: 1 }) }), wants)
    const none = scoreCandidate(candidate('B', { neighbourhood: hood({}) }), wants)

    expect(one.score).toBeGreaterThan(none.score)
  })

  /*
   * Absent, never zero. A candidate with nothing stated and nothing
   * measured has not scored badly — a bar at nought would read as a bad
   * house when nothing has been looked at.
   */
  it('is unproven rather than zero when nothing has been measured', () => {
    const scored = scoreCandidate(candidate('A'), wants)

    expect(scored.unproven).toBe(true)
    expect(scored.score).toBe(0)
  })

  it('is proven as soon as either half is known', () => {
    expect(scoreCandidate(candidate('A', { priceMinor: 1 }), wants).unproven).toBe(false)
    expect(scoreCandidate(candidate('B', { neighbourhood: hood({}) }), wants).unproven).toBe(false)
  })

  /*
   * Wants, not filters. A house over budget is a house over budget and
   * you may still want to look at it; a list that silently hid it would
   * be the app deciding what you get to consider.
   */
  it('never drops a candidate, however badly it scores', () => {
    const order = ranked(
      [candidate('Over', { priceMinor: 90_000_000 }), candidate('Fine', { priceMinor: 1 })],
      wants,
    )

    expect(order).toHaveLength(2)
  })

  it('ranks the unproven after everything it could judge', () => {
    const order = ranked([candidate('Unknown'), candidate('Judged', { priceMinor: 1 })], wants)

    expect(order.map((one) => one.candidate.address)).toEqual(['Judged', 'Unknown'])
  })
})

describe('reading stored wants back', () => {
  it('survives a blob that is not an object', () => {
    expect(parseWants('nonsense')).toEqual(DEFAULT_WANTS)
  })

  it('keeps kinds it recognises and drops the rest', () => {
    expect(parseWants({ wanted: ['parks', 'moon bases'] }).wanted).toEqual(['parks'])
  })

  /*
   * A stored radius of 50 km would ask Overpass for a whole county and
   * time out, which reads as the feature being broken.
   */
  it('clamps a radius that would time the query out', () => {
    expect(parseWants({ radiusMetres: 500_000 }).radiusMetres).toBe(5000)
    expect(parseWants({ radiusMetres: 5 }).radiusMetres).toBe(200)
  })

  it('leaves an unstated budget absent rather than zero', () => {
    expect('maxPriceMinor' in parseWants({})).toBe(false)
  })
})

/*
 * Found by reading a real Manhattan address, where `schools: 0` sat
 * beside 543 parks purely because schools had not been asked for. The
 * query only fetches the kinds you want, so a stored zero for anything
 * else is an absence rather than a measurement — and adding a kind to
 * your wants afterwards would drop the score against something nobody
 * had ever looked for.
 */
describe('a want nothing has looked for yet', () => {
  const measuredThree = hood({ groceries: 9, parks: 9, transit: 9 }, [
    'groceries',
    'parks',
    'transit',
  ])

  it('is not scored as a zero', () => {
    const three = { ...DEFAULT_WANTS, wanted: ['groceries', 'parks', 'transit'] as const }
    const four = { ...DEFAULT_WANTS, wanted: ['groceries', 'parks', 'transit', 'schools'] as const }

    const before = scoreCandidate(candidate('A', { neighbourhood: measuredThree }), three)
    const after = scoreCandidate(candidate('A', { neighbourhood: measuredThree }), four)

    // Adding a want must not lower a score against something unmeasured.
    expect(after.score).toBe(before.score)
  })

  it('is named, so a screen can offer to read it again', () => {
    const scored = scoreCandidate(candidate('A', { neighbourhood: measuredThree }), {
      ...DEFAULT_WANTS,
      wanted: ['groceries', 'schools', 'gyms'],
    })

    expect(scored.unmeasured).toEqual(['schools', 'gyms'])
  })

  it('reports nothing unmeasured once everything wanted was asked for', () => {
    const scored = scoreCandidate(candidate('A', { neighbourhood: measuredThree }), {
      ...DEFAULT_WANTS,
      wanted: ['groceries', 'parks'],
    })

    expect(scored.unmeasured).toEqual([])
  })

  /*
   * A genuine zero still counts against it. The distinction is between
   * "looked and found none" and "never looked" — the first is a real
   * answer about the address.
   */
  it('still scores a kind that was asked for and found nothing', () => {
    const looked = hood({ groceries: 9 }, ['groceries', 'schools'])

    const scored = scoreCandidate(candidate('A', { neighbourhood: looked }), {
      ...DEFAULT_WANTS,
      wanted: ['groceries', 'schools'],
    })

    expect(scored.reasons.some((one) => one.text.includes('No schools within reach'))).toBe(true)
    expect(scored.unmeasured).toEqual([])
  })

  it('is unproven when none of the wanted kinds was ever asked for', () => {
    const elsewhere = hood({ cafes: 30 }, ['cafes'])

    const scored = scoreCandidate(candidate('A', { neighbourhood: elsewhere }), {
      ...DEFAULT_WANTS,
      wanted: ['schools'],
    })

    expect(scored.unproven).toBe(true)
  })
})

/*
 * Stored records outlive the type that wrote them. A reading taken
 * before `asked` existed has none, and the first version of this made
 * the field required — `asked.includes(...)` then threw on the one
 * record already in the database and took the whole screen down. Found
 * by driving it, not by the suite.
 */
describe('a reading written before it recorded what it asked for', () => {
  const legacy = {
    counts: { ...EMPTY_COUNTS, groceries: 40, parks: 543 },
    radiusMetres: 1500,
    readAt: '2026-08-31T10:00:00Z',
  }

  it('does not throw', () => {
    expect(() =>
      scoreCandidate(candidate('A', { neighbourhood: legacy }), DEFAULT_WANTS),
    ).not.toThrow()
  })

  /*
   * Conservative on purpose: counts whose provenance is unknown are not
   * scored, so the screen prompts a re-read rather than crediting or
   * penalising numbers nobody can vouch for.
   */
  it('treats it as having measured nothing, and says what is missing', () => {
    const scored = scoreCandidate(candidate('A', { neighbourhood: legacy }), DEFAULT_WANTS)

    expect(scored.unmeasured).toEqual([...DEFAULT_WANTS.wanted])
    expect(scored.unproven).toBe(true)
  })
})
