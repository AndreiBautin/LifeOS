import { describe, expect, it } from 'vitest'

import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { monthRecap, monthsTrained, previousMonth } from './month'

const session = (date: string, sets: number, status: 'completed' | 'abandoned' = 'completed') =>
  aWorkout({
    date,
    status,
    startedAt: `${date}T09:00:00.000Z`,
    completedAt: `${date}T10:00:00.000Z`,
    entries: [anEntry({ sets: Array.from({ length: sets }, () => aSet()) })],
  })

describe('a month of training', () => {
  const logs = [
    session('2026-08-30', 2),
    session('2026-09-02', 3),
    session('2026-09-02', 1),
    session('2026-09-15', 4),
    session('2026-09-20', 9, 'abandoned'),
  ]
  const september = monthRecap(logs, '2026-09', '2026-10-02')

  it('totals the finished sessions in the month', () => {
    expect(september.sessions).toBe(3)
    expect(september.sets).toBe(8)
    expect(september.minutes).toBe(180)
  })

  it('counts sets per trained day, two sessions on one day together', () => {
    expect(september.days).toEqual({ '2026-09-02': 4, '2026-09-15': 4 })
  })

  it('compares with the month before', () => {
    expect(september.previous.sessions).toBe(1)
    expect(september.previous.sets).toBe(2)
  })

  it('compares a month still running with the same days of the month before', () => {
    const early = monthRecap(logs, '2026-09', '2026-09-02')
    // August's session on the 30th is past the 2nd, so it is not counted.
    expect(early.previous.sessions).toBe(0)
    expect(early.previousThrough).toBe('2026-08-02')
  })

  it('lists the months trained, newest first, and steps back across a year', () => {
    expect(monthsTrained(logs)).toEqual(['2026-09', '2026-08'])
    expect(previousMonth('2026-01')).toBe('2025-12')
  })
})
