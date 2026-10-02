import { describe, expect, it } from 'vitest'

import { stepValue } from './step'

describe('a stepper press', () => {
  it('moves one step from a number on the grid', () => {
    expect(stepValue(315, 1, 5)).toBe(320)
    expect(stepValue(315, -1, 5)).toBe(310)
  })

  /* Adding five to 317 would give 322, a load the plates do not make. */
  it('lands on the grid from a number off it', () => {
    expect(stepValue(317, 1, 5)).toBe(320)
    expect(stepValue(317, -1, 5)).toBe(315)
  })

  it('steps by halves and quarters without drifting', () => {
    expect(stepValue(100, 1, 2.5)).toBe(102.5)
    expect(stepValue(102.5, 1, 1.25)).toBe(103.75)
  })

  it('does not go below the floor', () => {
    expect(stepValue(0, -1, 1)).toBe(0)
    expect(stepValue(3, -1, 5)).toBe(0)
  })
})
