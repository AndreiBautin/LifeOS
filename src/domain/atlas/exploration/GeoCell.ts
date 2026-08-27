import type { Coordinates } from '../place/Coordinates'
import type { Brand } from '../shared/Brand'

/**
 * A patch of the world you either have or have not stood in, identified by its
 * geohash.
 *
 * Geohash rather than a bespoke grid because it is a plain string: it is its
 * own storage key, comparing two is string equality, and a shared prefix means
 * physical proximity — all of which a lat/lng pair would make into work.
 */
export type CellId = Brand<string, 'CellId'>

/**
 * Geohash length 7 ≈ 153m × 153m at the equator, narrowing towards the poles.
 * Chosen so that walking a city block reveals a cell or two: coarser and a
 * single stop would clear a whole neighbourhood, finer and a day of walking
 * would barely show.
 */
export const CELL_PRECISION = 7

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'
const BITS = [16, 8, 4, 2, 1]

export interface BoundingBox {
  readonly north: number
  readonly south: number
  readonly east: number
  readonly west: number
}

/**
 * Standard geohash encoding: repeatedly halve the world, alternating between
 * longitude and latitude, and record which half the point fell in.
 */
export function toCellId(coordinates: Coordinates, precision: number = CELL_PRECISION): CellId {
  let minLat = -90
  let maxLat = 90
  let minLon = -180
  let maxLon = 180

  let hash = ''
  let bit = 0
  let charIndex = 0
  let evenBit = true

  while (hash.length < precision) {
    if (evenBit) {
      const midLon = (minLon + maxLon) / 2
      if (coordinates.longitude > midLon) {
        charIndex |= BITS[bit] ?? 0
        minLon = midLon
      } else {
        maxLon = midLon
      }
    } else {
      const midLat = (minLat + maxLat) / 2
      if (coordinates.latitude > midLat) {
        charIndex |= BITS[bit] ?? 0
        minLat = midLat
      } else {
        maxLat = midLat
      }
    }

    evenBit = !evenBit

    if (bit < 4) {
      bit += 1
    } else {
      hash += BASE32.charAt(charIndex)
      bit = 0
      charIndex = 0
    }
  }

  return hash as CellId
}

/** The rectangle a cell covers — what actually gets drawn as a hole in the fog. */
export function cellBounds(cell: CellId): BoundingBox {
  let minLat = -90
  let maxLat = 90
  let minLon = -180
  let maxLon = 180
  let evenBit = true

  for (const character of cell) {
    const charIndex = BASE32.indexOf(character)
    if (charIndex === -1) {
      // An unrecognised character can only come from corrupted storage; stop
      // rather than silently returning a wrong rectangle for the rest.
      break
    }

    for (const mask of BITS) {
      const bitSet = (charIndex & mask) !== 0
      if (evenBit) {
        const midLon = (minLon + maxLon) / 2
        if (bitSet) minLon = midLon
        else maxLon = midLon
      } else {
        const midLat = (minLat + maxLat) / 2
        if (bitSet) minLat = midLat
        else maxLat = midLat
      }
      evenBit = !evenBit
    }
  }

  return { north: maxLat, south: minLat, east: maxLon, west: minLon }
}

const EARTH_RADIUS_KM = 6371

/** Approximate ground area of a cell, for turning a cell count into "km² explored". */
export function cellAreaKm2(cell: CellId): number {
  const { north, south, east, west } = cellBounds(cell)
  const meanLatRadians = (((north + south) / 2) * Math.PI) / 180
  const heightKm = ((north - south) * Math.PI * EARTH_RADIUS_KM) / 180
  const widthKm = ((east - west) * Math.PI * EARTH_RADIUS_KM * Math.cos(meanLatRadians)) / 180
  return heightKm * widthKm
}
