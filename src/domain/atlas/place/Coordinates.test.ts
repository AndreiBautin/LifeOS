import { describe, expect, it } from 'vitest'
import { isErr, isOk } from '../shared/Result'
import { createCoordinates, distanceKm } from './Coordinates'

describe('createCoordinates', () => {
  it('creates coordinates from valid latitude and longitude', () => {
    const result = createCoordinates(40.7128, -74.006)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toEqual({ latitude: 40.7128, longitude: -74.006 })
    }
  })

  it.each([
    [-90, -180],
    [90, 180],
    [0, 0],
  ])('accepts boundary values (%d, %d)', (latitude, longitude) => {
    const result = createCoordinates(latitude, longitude)

    expect(isOk(result)).toBe(true)
  })

  it('rejects a latitude below -90', () => {
    const result = createCoordinates(-90.1, 0)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.field).toBe('latitude')
    }
  })

  it('rejects a latitude above 90', () => {
    const result = createCoordinates(90.1, 0)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.field).toBe('latitude')
    }
  })

  it('rejects a longitude below -180', () => {
    const result = createCoordinates(0, -180.1)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.field).toBe('longitude')
    }
  })

  it('rejects a longitude above 180', () => {
    const result = createCoordinates(0, 180.1)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.field).toBe('longitude')
    }
  })

  it('rejects non-finite values', () => {
    const result = createCoordinates(Number.NaN, 0)

    expect(isErr(result)).toBe(true)
  })
})

describe('distanceKm', () => {
  it('returns 0 for identical coordinates', () => {
    const point = { latitude: 40.7128, longitude: -74.006 }

    expect(distanceKm(point, point)).toBe(0)
  })

  it('approximates the distance between New York and Los Angeles', () => {
    const newYork = { latitude: 40.7128, longitude: -74.006 }
    const losAngeles = { latitude: 34.0522, longitude: -118.2437 }

    expect(distanceKm(newYork, losAngeles)).toBeCloseTo(3936, -2)
  })

  it('is symmetric', () => {
    const a = { latitude: 51.5074, longitude: -0.1278 }
    const b = { latitude: 48.8566, longitude: 2.3522 }

    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 6)
  })
})
