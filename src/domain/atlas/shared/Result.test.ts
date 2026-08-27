import { describe, expect, it } from 'vitest'
import { err, isErr, isOk, mapResult, ok } from './Result'

describe('Result', () => {
  it('creates a successful result carrying its value', () => {
    const result = ok(42)

    expect(result.ok).toBe(true)
    expect(isOk(result)).toBe(true)
    expect(isErr(result)).toBe(false)
    if (isOk(result)) {
      expect(result.value).toBe(42)
    }
  })

  it('creates a failed result carrying its error', () => {
    const result = err('something went wrong')

    expect(result.ok).toBe(false)
    expect(isErr(result)).toBe(true)
    expect(isOk(result)).toBe(false)
    if (isErr(result)) {
      expect(result.error).toBe('something went wrong')
    }
  })

  it('maps the value of a successful result', () => {
    const result = mapResult(ok(2), (value) => value * 10)

    expect(result).toEqual(ok(20))
  })

  it('leaves a failed result untouched when mapping', () => {
    const failure = err<string, number>('nope')
    const result = mapResult(failure, (value) => value * 10)

    expect(result).toEqual(err('nope'))
  })
})
