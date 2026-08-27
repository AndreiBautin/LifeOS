import { describe, expect, it } from 'vitest'
import { cellAreaKm2, cellBounds, toCellId, type CellId } from './GeoCell'

describe('toCellId', () => {
  it('matches the reference geohash for a known point', () => {
    // The canonical geohash example: Rio de Janeiro's "7h0kzs..."-free case,
    // -25.383, -49.266 -> "6gkzwgj" at precision 7.
    expect(toCellId({ latitude: -25.383, longitude: -49.266 }, 7)).toBe('6gkzwgj')
  })

  it('encodes to the requested precision', () => {
    const point = { latitude: 37.8012, longitude: -122.2739 }

    expect(toCellId(point, 5)).toHaveLength(5)
    expect(toCellId(point, 9)).toHaveLength(9)
  })

  it('is a prefix relationship: coarser is a prefix of finer', () => {
    const point = { latitude: 37.8012, longitude: -122.2739 }

    expect(toCellId(point, 9).startsWith(toCellId(point, 5))).toBe(true)
  })

  it('gives the same cell to two points a few metres apart inside it', () => {
    // Measured from the cell's centre on purpose: any grid has boundaries,
    // and two points metres apart can legitimately straddle one.
    const bounds = cellBounds(toCellId({ latitude: 37.8012, longitude: -122.2739 }))
    const centre = {
      latitude: (bounds.north + bounds.south) / 2,
      longitude: (bounds.east + bounds.west) / 2,
    }
    const aFewMetresAway = {
      latitude: centre.latitude + 0.00002,
      longitude: centre.longitude - 0.00002,
    }

    expect(toCellId(aFewMetresAway)).toBe(toCellId(centre))
  })

  it('gives different cells to points a kilometre apart', () => {
    const a = { latitude: 37.8012, longitude: -122.2739 }
    const b = { latitude: 37.8112, longitude: -122.2739 }

    expect(toCellId(a)).not.toBe(toCellId(b))
  })

  it('handles the extremes without falling apart', () => {
    expect(toCellId({ latitude: 90, longitude: 180 })).toHaveLength(7)
    expect(toCellId({ latitude: -90, longitude: -180 })).toHaveLength(7)
    expect(toCellId({ latitude: 0, longitude: 0 })).toHaveLength(7)
  })
})

describe('cellBounds', () => {
  it('returns a box that contains the point it came from', () => {
    const point = { latitude: 37.8012, longitude: -122.2739 }
    const bounds = cellBounds(toCellId(point))

    expect(point.latitude).toBeGreaterThanOrEqual(bounds.south)
    expect(point.latitude).toBeLessThanOrEqual(bounds.north)
    expect(point.longitude).toBeGreaterThanOrEqual(bounds.west)
    expect(point.longitude).toBeLessThanOrEqual(bounds.east)
  })

  it('is roughly 150m across at precision 7', () => {
    const bounds = cellBounds(toCellId({ latitude: 37.8, longitude: -122.27 }))
    const heightMeters = (bounds.north - bounds.south) * 111320

    expect(heightMeters).toBeGreaterThan(100)
    expect(heightMeters).toBeLessThan(200)
  })

  it('round-trips: the centre of a cell encodes back to that cell', () => {
    const cell = toCellId({ latitude: 51.5074, longitude: -0.1278 })
    const bounds = cellBounds(cell)
    const centre = {
      latitude: (bounds.north + bounds.south) / 2,
      longitude: (bounds.east + bounds.west) / 2,
    }

    expect(toCellId(centre)).toBe(cell)
  })

  it('stops rather than mangling the box when storage hands back nonsense', () => {
    const bounds = cellBounds('gc!!!!!' as CellId)

    expect(Number.isFinite(bounds.north)).toBe(true)
    expect(bounds.north).toBeGreaterThan(bounds.south)
  })
})

describe('cellAreaKm2', () => {
  it('is a small fraction of a square kilometre at precision 7', () => {
    const area = cellAreaKm2(toCellId({ latitude: 37.8, longitude: -122.27 }))

    expect(area).toBeGreaterThan(0.005)
    expect(area).toBeLessThan(0.05)
  })

  it('narrows towards the poles, as lines of longitude converge', () => {
    const equator = cellAreaKm2(toCellId({ latitude: 0, longitude: 0 }))
    const northern = cellAreaKm2(toCellId({ latitude: 70, longitude: 0 }))

    expect(northern).toBeLessThan(equator)
  })
})
