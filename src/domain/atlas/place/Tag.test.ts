import { describe, expect, it } from 'vitest'
import { isErr, isOk } from '../shared/Result'
import { createTag, normalizeTags } from './Tag'

describe('createTag', () => {
  it('trims and lowercases a raw tag', () => {
    const result = createTag('  Cozy  ')

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toBe('cozy')
    }
  })

  it('rejects an empty tag', () => {
    const result = createTag('   ')

    expect(isErr(result)).toBe(true)
  })

  it('rejects a tag longer than 40 characters', () => {
    const result = createTag('a'.repeat(41))

    expect(isErr(result)).toBe(true)
  })
})

describe('normalizeTags', () => {
  it('trims, lowercases, and deduplicates tags', () => {
    const tags = normalizeTags(['Cozy', ' cozy ', 'Rooftop'])

    expect(tags).toEqual(['cozy', 'rooftop'])
  })

  it('drops empty and whitespace-only entries', () => {
    const tags = normalizeTags(['', '   ', 'good'])

    expect(tags).toEqual(['good'])
  })

  it('returns an empty array for no input', () => {
    expect(normalizeTags([])).toEqual([])
  })
})
