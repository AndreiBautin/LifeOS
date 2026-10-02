import { describe, expect, it } from 'vitest'

import { isProgress, versusLast } from './versus-last'

describe('a set against last time', () => {
  it('counts a heavier bar as progress whatever the reps did', () => {
    const versus = versusLast({ load: 230, reps: 3 }, { load: 225, reps: 5 })
    expect(versus).toEqual({ kind: 'heavier', by: 5 })
    expect(versus !== undefined && isProgress(versus)).toBe(true)
  })

  it('compares reps only at the same bar', () => {
    expect(versusLast({ load: 115, reps: 9 }, { load: 115, reps: 7 })).toEqual({
      kind: 'more-reps',
      by: 2,
    })
    expect(versusLast({ load: 115, reps: 6 }, { load: 115, reps: 7 })).toEqual({
      kind: 'fewer-reps',
      by: 1,
    })
    expect(versusLast({ load: 115, reps: 7 }, { load: 115, reps: 7 })).toEqual({ kind: 'matched' })
  })

  /*
   * A lighter bar with more reps is not quietly converted into "progress"
   * through an estimated max; it is reported as what it is.
   */
  it('reports a lighter bar as lighter, not as a win on reps', () => {
    const versus = versusLast({ load: 95, reps: 12 }, { load: 115, reps: 8 })
    expect(versus).toEqual({ kind: 'lighter', by: 20 })
    expect(versus !== undefined && isProgress(versus)).toBe(false)
  })

  it('reads a missing load as the body alone', () => {
    expect(versusLast({ reps: 11 }, { reps: 9 })).toEqual({ kind: 'more-reps', by: 2 })
  })

  it('subtracts small plates exactly', () => {
    expect(versusLast({ load: 102.5, reps: 5 }, { load: 101.25, reps: 5 })).toEqual({
      kind: 'heavier',
      by: 1.25,
    })
  })

  it('has nothing to say without reps on both sides', () => {
    expect(versusLast({ load: 100 }, { load: 100, reps: 5 })).toBeUndefined()
  })
})
