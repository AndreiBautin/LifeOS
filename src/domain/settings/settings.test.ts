import { describe, expect, it } from 'vitest'

import { holdsSampleData } from './settings'

/*
 * The guard in front of sync. Wrong in one direction and the sample is
 * uploaded into a real history, which is what happened the first time;
 * wrong in the other and connecting a real device wipes it.
 */
describe('holdsSampleData', () => {
  it('holds the sample while it is loaded, and after its note is dismissed', () => {
    expect(holdsSampleData({ sampleData: 'loaded' })).toBe(true)
    expect(holdsSampleData({ sampleData: 'kept' })).toBe(true)
  })

  it('does not once it has been cleared, or when it was never loaded', () => {
    expect(holdsSampleData({ sampleData: 'cleared' })).toBe(false)
    expect(holdsSampleData({})).toBe(false)
  })
})
