import { describe, expect, it } from 'vitest'

import { SORT_KEY_LABELS, SORT_KEYS, isSortKey } from './sort-key'

describe('SORT_KEY_LABELS', () => {
  it('has exactly one label per sort key with no typos or gaps', () => {
    expect(Object.keys(SORT_KEY_LABELS).sort()).toEqual([...SORT_KEYS].sort())
  })

  it('never has an empty label', () => {
    for (const key of SORT_KEYS) {
      expect(SORT_KEY_LABELS[key].length).toBeGreaterThan(0)
    }
  })
})

describe('isSortKey', () => {
  it('accepts every registered sort key', () => {
    for (const key of SORT_KEYS) {
      expect(isSortKey(key)).toBe(true)
    }
  })

  it('rejects an unknown string', () => {
    expect(isSortKey('not-a-sort-key')).toBe(false)
  })
})
