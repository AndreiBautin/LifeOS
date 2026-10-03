import { describe, expect, it } from 'vitest'

import { shiftDay } from '@/domain/time/day'

import { goalStanding, type LiftGoal } from './goal'
import type { TrendPoint } from './trend'

/** A session a week from the given day, climbing `perWeek` from `start`. */
function climbing(start: number, perWeek: number, weeks: number): TrendPoint[] {
  return Array.from({ length: weeks }, (_, week) => ({
    date: shiftDay('2026-01-05', week * 7),
    value: start + perWeek * week,
  }))
}

const goal = (load: number, by: string): LiftGoal => ({
  load,
  by,
  setOn: '2026-01-05',
  from: 200,
})

describe('a lift goal', () => {
  const points = climbing(200, 2.5, 8) // 200 → 217.5 by 2026-02-23

  it('is on pace when the trend line reaches it by the date', () => {
    const standing = goalStanding(points, goal(240, '2026-06-01'), '2026-02-23')
    expect(standing.kind).toBe('on-pace')
  })

  it('is behind when the line arrives after the date, and says what it needs', () => {
    const standing = goalStanding(points, goal(260, '2026-04-06'), '2026-02-23')
    expect(standing.kind).toBe('behind')
    if (standing.kind !== 'behind') return
    expect(standing.ratePerWeek).toBeCloseTo(2.5)
    // 42.5 to go in six weeks.
    expect(standing.neededPerWeek).toBeCloseTo(42.5 / 6)
  })

  it('is met the moment a session measures it, whatever the date', () => {
    expect(goalStanding(points, goal(215, '2026-12-01'), '2026-02-23').kind).toBe('met')
  })

  it('is missed once the date passes short of it', () => {
    expect(goalStanding(points, goal(260, '2026-02-01'), '2026-02-23').kind).toBe('missed')
  })

  /* Too little to fit a line: still say the arithmetic, never a forecast. */
  it('names the weekly need without a forecast when there is too little to fit', () => {
    const standing = goalStanding(points.slice(0, 2), goal(230, '2026-03-02'), '2026-01-12')
    expect(standing.kind).toBe('unknown')
  })
})
