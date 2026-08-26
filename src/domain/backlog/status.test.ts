import { describe, expect, it } from 'vitest'

import { STATUS_LABELS, STATUSES } from './status'

describe('STATUS_LABELS', () => {
  it('has exactly one label per status with no typos or gaps', () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([...STATUSES].sort())
  })

  it('never has an empty label', () => {
    for (const status of STATUSES) {
      expect(STATUS_LABELS[status].length).toBeGreaterThan(0)
    }
  })
})
