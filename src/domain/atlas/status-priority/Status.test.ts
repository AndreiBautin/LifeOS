import { describe, expect, it } from 'vitest'
import { isStatus, STATUS_METADATA, STATUSES } from './Status'

describe('Status', () => {
  it('has metadata for every status', () => {
    for (const status of STATUSES) {
      expect(STATUS_METADATA[status].label).toBeTruthy()
    }
  })

  it('identifies valid status strings', () => {
    expect(isStatus('visited')).toBe(true)
  })

  it('rejects unknown status strings', () => {
    expect(isStatus('not-a-status')).toBe(false)
  })
})
