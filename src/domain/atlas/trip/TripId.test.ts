import { describe, expect, it } from 'vitest'
import { isErr, isOk } from '../shared/Result'
import { createTripId } from './TripId'

describe('createTripId', () => {
  it('accepts a non-empty string', () => {
    const result = createTripId('trip-1')

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toBe('trip-1')
    }
  })

  it('rejects an empty string', () => {
    expect(isErr(createTripId(''))).toBe(true)
  })

  it('rejects a whitespace-only string', () => {
    expect(isErr(createTripId('   '))).toBe(true)
  })
})
