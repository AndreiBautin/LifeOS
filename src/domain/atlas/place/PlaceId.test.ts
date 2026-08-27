import { describe, expect, it } from 'vitest'
import { isErr, isOk } from '../shared/Result'
import { createPlaceId } from './PlaceId'

describe('createPlaceId', () => {
  it('accepts a non-empty string', () => {
    const result = createPlaceId('a1b2c3')

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toBe('a1b2c3')
    }
  })

  it('rejects an empty string', () => {
    const result = createPlaceId('')

    expect(isErr(result)).toBe(true)
  })

  it('rejects a whitespace-only string', () => {
    const result = createPlaceId('   ')

    expect(isErr(result)).toBe(true)
  })
})
