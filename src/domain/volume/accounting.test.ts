import { describe, expect, it } from 'vitest'

import { hypertrophyCredit } from '@/domain/volume/accounting'

/*
 * Proximity to failure, alongside reps.
 *
 * The case that forced this: fifteen bench sets at RPE 8 covered a
 * twelve-set chest target on their own, so the assembler concluded the
 * chest needed no direct work at all. Five reps at RPE 8 and five at
 * RPE 10 are not the same evidence and were counted the same.
 */
describe('crediting a set by how close to failure it ends', () => {
  it('gives a set at one rep in reserve full credit', () => {
    // The landmarks are published in hard sets, and a hard set in that
    // literature is one taken to about a rep short. Discounting RPE 9
    // would change the unit every target is expressed in.
    expect(hypertrophyCredit(5, 9)).toBe(1)
    expect(hypertrophyCredit(12, 9)).toBe(1)
  })

  it('gives a set taken to failure full credit too', () => {
    expect(hypertrophyCredit(5, 10)).toBe(1)
  })

  it('discounts a set that stops further out', () => {
    expect(hypertrophyCredit(5, 8)).toBeCloseTo(0.8, 2)
    expect(hypertrophyCredit(5, 7)).toBeCloseTo(0.6, 2)
  })

  it('still discounts a low-rep set, and compounds the two', () => {
    // A heavy triple stopped two short is short on both counts.
    expect(hypertrophyCredit(3, 10)).toBeCloseTo(0.6, 2)
    expect(hypertrophyCredit(3, 8)).toBeCloseTo(0.6, 2)
    expect(hypertrophyCredit(2, 8)).toBeCloseTo(0.4, 2)
  })

  it('credits a set in full when no RPE is prescribed', () => {
    // Guessing at a set the program says nothing about would be
    // inventing evidence rather than reading it.
    expect(hypertrophyCredit(5)).toBe(1)
  })
})
