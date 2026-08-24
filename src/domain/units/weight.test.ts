import { describe, expect, it } from 'vitest'

import { DomainError } from '@/domain/errors/domain-error'

import { convertWeight, formatLoad, roundLoad } from './weight'

describe('roundLoad', () => {
  it.each([
    [228.375, 5, 'nearest', 230],
    [228.375, 5, 'down', 225],
    [228.375, 5, 'up', 230],
    [227.4, 5, 'nearest', 225],
    [100, 5, 'nearest', 100],
    [61.25, 2.5, 'nearest', 62.5],
    [0, 5, 'nearest', 0],
  ] as const)('rounds %s to a %s multiple (%s) → %s', (value, increment, mode, expected) => {
    expect(roundLoad(value, increment, mode)).toBe(expected)
  })

  it('does not leak binary floating point into the result', () => {
    // 47.5 * 3 is 142.49999999999997 in IEEE 754. A load that renders as
    // two different strings in two places reads as a bug to the user.
    expect(roundLoad(142.4, 47.5)).toBe(142.5)
  })

  it('rejects a non-positive increment rather than dividing by zero', () => {
    expect(() => roundLoad(100, 0)).toThrow(DomainError)
    expect(() => roundLoad(100, -5)).toThrow(DomainError)
  })

  it('rejects a non-finite load', () => {
    expect(() => roundLoad(Number.NaN, 5)).toThrow(DomainError)
  })
})

describe('convertWeight', () => {
  it('is identity within a unit', () => {
    expect(convertWeight(225, 'lb', 'lb')).toBe(225)
  })

  it('round-trips within floating point tolerance', () => {
    expect(convertWeight(convertWeight(225, 'lb', 'kg'), 'kg', 'lb')).toBeCloseTo(225, 6)
  })

  it('converts 100 kg to approximately 220.46 lb', () => {
    expect(convertWeight(100, 'kg', 'lb')).toBeCloseTo(220.46, 2)
  })
})

describe('formatLoad', () => {
  it('drops a trailing zero on whole numbers', () => {
    expect(formatLoad(135, 'lb')).toBe('135 lb')
  })

  it('keeps one decimal on fractional loads', () => {
    expect(formatLoad(137.5, 'lb')).toBe('137.5 lb')
    expect(formatLoad(62.5, 'kg')).toBe('62.5 kg')
  })
})
