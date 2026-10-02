import { describe, expect, it } from 'vitest'

import { platesFor } from './plates'
import { warmupRamp } from './ramp'

describe('a warm-up ramp', () => {
  it('climbs from the empty bar through forty, sixty and eighty percent', () => {
    expect(warmupRamp(315, 'lb')).toEqual([
      { load: 45, reps: 10 },
      { load: 125, reps: 5 },
      { load: 185, reps: 3 },
      { load: 250, reps: 2 },
    ])
  })

  it('rounds every step down to a load the plates to hand can make', () => {
    // No 2.5s, 5s or 35s.
    const plates = [45, 25, 10]
    const steps = warmupRamp(315, 'lb', 'barbell', plates)
    expect(steps.length).toBeGreaterThan(2)
    for (const step of steps) {
      expect(platesFor(step.load, 'lb', 'barbell', plates)?.leftover).toBe(0)
    }
  })

  /*
   * A light working load rounds two steps onto one; it is warmed up once,
   * not twice at the same weight.
   */
  it('drops a step that lands on the one before it or against the working load', () => {
    expect(warmupRamp(95, 'lb')).toEqual([
      { load: 45, reps: 10 },
      { load: 55, reps: 3 },
      { load: 75, reps: 2 },
    ])
  })

  it('has nothing to ramp to at or below the bar', () => {
    expect(warmupRamp(45, 'lb')).toEqual([])
  })

  it('ramps an EZ bar from its own weight', () => {
    expect(warmupRamp(85, 'lb', 'ez-bar')[0]).toEqual({ load: 25, reps: 10 })
  })
})
