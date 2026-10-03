import { describe, expect, it } from 'vitest'

import { estimateOneRepMax } from './one-rep-max'
import { loadForReps, repMaxTable } from './rep-max'

describe('the rep-max table', () => {
  it('runs each formula backwards to the load it came from', () => {
    for (const formula of ['epley', 'brzycki', 'lombardi'] as const) {
      const max = estimateOneRepMax(225, 5, formula).value
      expect(loadForReps(max, 5, formula)).toBeCloseTo(225, 0)
    }
  })

  it('rounds down to a loadable bar, and the 1RM row is the estimate', () => {
    const rows = repMaxTable(300, [], 'epley', 5)
    expect(rows[0]).toEqual({ reps: 1, predicted: 300 })
    expect(rows.find((row) => row.reps === 5)?.predicted).toBe(255) // 257.1 down to 255
  })

  /* A set of five is not a single: it does not fill the 1-rep row. */
  it('puts beside each row the heaviest bar done in its own rep bracket', () => {
    const rows = repMaxTable(
      300,
      [
        { load: 240, reps: 8 },
        { load: 265, reps: 3 },
        { load: 250, reps: 6 },
      ],
      'epley',
      5,
    )
    expect(rows.find((row) => row.reps === 1)?.actual).toBeUndefined()
    expect(rows.find((row) => row.reps === 3)?.actual).toBe(265)
    expect(rows.find((row) => row.reps === 5)?.actual).toBe(250)
    expect(rows.find((row) => row.reps === 8)?.actual).toBe(240)
  })
})
