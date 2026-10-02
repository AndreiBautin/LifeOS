import { describe, expect, it } from 'vitest'

import { shiftDay } from '@/domain/time/day'

import { projectReach } from './projection'

/** A session a week from `start`, climbing `perWeek` from `first`. */
function weekly(start: string, weeks: number, first: number, perWeek: number) {
  return Array.from({ length: weeks }, (_, i) => ({
    date: shiftDay(start, i * 7),
    value: first + i * perWeek,
  }))
}

describe('projecting a lift forward', () => {
  it('reads a steady climb forward to the target', () => {
    // 300 to 330 over ten weeks: 3 a week, so 360 is ten weeks after the last.
    const points = weekly('2026-06-01', 11, 300, 3)
    const last = points.at(-1)?.date ?? ''
    expect(projectReach(points, 360, last)).toBe(shiftDay(last, 70))
  })

  it('says nothing for a flat or falling line', () => {
    expect(projectReach(weekly('2026-06-01', 8, 300, 0), 360, '2026-08-01')).toBeUndefined()
    expect(projectReach(weekly('2026-06-01', 8, 300, -2), 360, '2026-08-01')).toBeUndefined()
  })

  it('says nothing from too little evidence', () => {
    expect(projectReach(weekly('2026-06-01', 3, 300, 5), 360, '2026-06-15')).toBeUndefined()
    // Four sessions in a fortnight is not four weeks of span.
    const crammed = [0, 4, 8, 12].map((d, i) => ({
      date: shiftDay('2026-06-01', d),
      value: 300 + i,
    }))
    expect(projectReach(crammed, 360, '2026-06-13')).toBeUndefined()
  })

  /* A line drawn past the edge of the evidence is not a forecast. */
  it('says nothing for a date more than a year out', () => {
    const slow = weekly('2026-06-01', 12, 300, 0.5)
    expect(projectReach(slow, 400, slow.at(-1)?.date ?? '')).toBeUndefined()
  })

  it('says nothing once the lift is already there', () => {
    expect(projectReach(weekly('2026-06-01', 8, 300, 5), 320, '2026-08-01')).toBeUndefined()
  })
})
