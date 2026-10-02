import { describe, expect, it } from 'vitest'

import { platesFor } from './plates'

describe('loading a bar', () => {
  it('loads the heaviest plates first, the way a person does', () => {
    expect(platesFor(315, 'lb')).toEqual({ bar: 45, perSide: [45, 45, 45], leftover: 0 })
    expect(platesFor(235, 'lb')?.perSide).toEqual([45, 45, 5])
  })

  it('reaches the small plates', () => {
    expect(platesFor(140, 'lb')?.perSide).toEqual([45, 2.5])
    expect(platesFor(102.5, 'kg')?.perSide).toEqual([25, 15, 1.25])
  })

  it('has nothing to add to an empty bar, and nothing at all below it', () => {
    expect(platesFor(45, 'lb')).toEqual({ bar: 45, perSide: [], leftover: 0 })
    expect(platesFor(30, 'lb')).toBeUndefined()
  })

  /*
   * A load the plates cannot make is reported, not rounded away: showing
   * 227 lb as 225 would be drawing a different bar from the one logged.
   */
  it('reports what the plates cannot make', () => {
    expect(platesFor(227, 'lb')).toEqual({ bar: 45, perSide: [45, 45], leftover: 1 })
  })

  it('starts an EZ bar from its own weight', () => {
    expect(platesFor(65, 'lb', 'ez-bar')?.perSide).toEqual([10, 10])
  })
})
