import { describe, expect, it } from 'vitest'

import { readLadder, type Ladder } from './ladder'

const ladder: Ladder = {
  id: 'test.thing',
  source: 'test.measurement',
  name: 'Thing',
  unit: 'x',
  anchor: 'A published standard',
  thresholds: [1, 2, 4, 8, 16],
}

describe('readLadder', () => {
  /*
   * A threshold is the value at which a level is *reached*, so a value
   * sitting on rung 1 is at `LEVELS[1]` and climbing toward `LEVELS[2]`.
   */
  it('places a value between two rungs and reports the next one', () => {
    const reading = readLadder(ladder, 3)

    expect(reading.level).toBe('Novice')
    expect(reading.progress).toBeCloseTo(0.5)
    expect(reading.next).toEqual({ level: 'Intermediate', at: 4 })
  })

  it('reports no next level at the top', () => {
    const reading = readLadder(ladder, 20)

    expect(reading.level).toBe('Elite')
    expect(reading.progress).toBe(1)
    expect(reading.next).toBeUndefined()
  })

  it('places a value below the first rung as untrained, with progress toward it', () => {
    const reading = readLadder(ladder, 0.5)

    expect(reading.level).toBe('Untrained')
    expect(reading.progress).toBeCloseTo(0.5)
    expect(reading.next).toEqual({ level: 'Novice', at: 1 })
  })
})
