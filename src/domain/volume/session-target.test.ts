import { describe, expect, it } from 'vitest'

import { sessionProgress } from './session-target'

/**
 * The case this exists for: a lifter who stopped at two back-offs instead
 * of four is several sets short in a session that, on paper, is complete.
 */

describe('where the session stands', () => {
  it('reports what is still owed', () => {
    const rows = sessionProgress({ chest: 6, triceps: 4 }, { chest: 3.6, triceps: 4 })

    expect(rows).toEqual([
      { muscle: 'chest', target: 6, done: 3.6, remaining: 2.4 },
      { muscle: 'triceps', target: 4, done: 4, remaining: 0 },
    ])
  })

  it('puts the muscle worth acting on first', () => {
    const rows = sessionProgress(
      { chest: 6, triceps: 4, biceps: 5 },
      { chest: 5, triceps: 1, biceps: 5 },
    )

    expect(rows.map((row) => row.muscle)).toEqual(['triceps', 'chest', 'biceps'])
  })

  it('never reports a negative debt', () => {
    // Over-delivering is common — the competition lifts pay several
    // muscles — and "-3 remaining" reads as an error rather than as done.
    const rows = sessionProgress({ chest: 6 }, { chest: 9 })

    expect(rows[0]?.remaining).toBe(0)
    expect(rows[0]?.done).toBe(9)
  })

  it('counts a muscle with nothing logged yet as owing everything', () => {
    expect(sessionProgress({ chest: 6 }, {})[0]).toEqual({
      muscle: 'chest',
      target: 6,
      done: 0,
      remaining: 6,
    })
  })

  it('ignores a muscle the day carries no target for', () => {
    // The day pays a dozen muscles incidentally. Listing them turns a
    // glanceable answer into a table.
    const rows = sessionProgress({ chest: 6 }, { chest: 6, forearms: 4 })

    expect(rows).toHaveLength(1)
  })

  it('drops the floating-point tail that fractional credit produces', () => {
    // Half a set for a secondary, four fifths for a set at RPE 8. Raw,
    // this reads "5.999999999999999 of 6" between sets.
    const rows = sessionProgress({ chest: 6 }, { chest: 0.1 + 0.2 })

    expect(rows[0]?.done).toBe(0.3)
    expect(rows[0]?.remaining).toBe(5.7)
  })
})
