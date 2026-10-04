import { describe, expect, it } from 'vitest'

import { restCuesBetween } from './rest-cues'

describe('rest timer sounds', () => {
  it('ticks as each of the last three seconds is crossed', () => {
    expect(restCuesBetween(3_100, 2_900)).toEqual(['tick'])
    expect(restCuesBetween(2_050, 1_800)).toEqual(['tick'])
    expect(restCuesBetween(1_010, 760)).toEqual(['tick'])
  })

  it('chimes once at the end, and not again after it', () => {
    expect(restCuesBetween(120, 0)).toEqual(['done'])
    expect(restCuesBetween(0, 0)).toEqual([])
  })

  it('stays quiet between the marks', () => {
    expect(restCuesBetween(40_000, 39_750)).toEqual([])
    expect(restCuesBetween(2_900, 2_650)).toEqual([])
  })

  /* A phone unlocked after the rest ran out should not rattle off a countdown. */
  it('sounds only the end when a suspended tab jumps past it', () => {
    expect(restCuesBetween(40_000, 0)).toEqual(['done'])
    expect(restCuesBetween(5_000, 1_500)).toEqual([])
  })

  it('sounds nothing when time is added', () => {
    expect(restCuesBetween(2_500, 32_500)).toEqual([])
  })
})
