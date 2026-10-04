import { describe, expect, it } from 'vitest'

import { asExerciseId } from '@/domain/ids/ids'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { periodOf, wrappedFor } from './wrapped'

const BENCH = asExerciseId('bench-press')
const SQUAT = asExerciseId('squat')

describe('the period a story covers', () => {
  it('reads a month to its last day, leap years included', () => {
    expect(periodOf('2026-09')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(periodOf('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(periodOf('2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })

  it('reads a year whole, and refuses anything else', () => {
    expect(periodOf('2026')).toEqual({ start: '2026-01-01', end: '2026-12-31' })
    expect(periodOf('2026-13')).toBeUndefined()
    expect(periodOf('soon')).toBeUndefined()
  })
})

describe('a period told as a story', () => {
  const session = (date: string, bench: number, squat: number, sets = 1) =>
    aWorkout({
      date,
      startedAt: `${date}T18:00:00`,
      completedAt: `${date}T19:00:00`,
      entries: [
        anEntry({
          exerciseId: BENCH,
          sets: Array.from({ length: sets }, () => aSet({ actualLoad: bench, actualReps: 5 })),
        }),
        anEntry({ exerciseId: SQUAT, sets: [aSet({ actualLoad: squat, actualReps: 3 })] }),
      ],
    })
  const story = wrappedFor(
    [
      session('2026-08-31', 400, 400),
      session('2026-09-01', 200, 300),
      session('2026-09-15', 210, 300, 4),
      session('2026-09-29', 230, 305),
    ],
    { start: '2026-09-01', end: '2026-09-30' },
    '2026-10-03',
  )

  it('counts only the period', () => {
    expect(story).toMatchObject({ sessions: 3, days: 3, minutes: 180, sets: 9 })
  })

  it('names the heaviest bar and the exercise that moved most', () => {
    expect(story.heaviest).toMatchObject({ exerciseId: SQUAT, load: 305, reps: 3 })
    expect(story.mostImproved?.exerciseId).toBe(BENCH)
    expect(story.mostImproved?.change).toBeCloseTo(0.15)
  })

  it('finds the week with the most working sets', () => {
    expect(story.busiestWeek).toEqual({ monday: '2026-09-14', sets: 5 })
  })

  /* Nothing moved up is not a story about improvement. */
  it('names no most improved when nothing rose', () => {
    const flat = wrappedFor(
      [session('2026-09-01', 200, 300), session('2026-09-08', 200, 300)],
      { start: '2026-09-01', end: '2026-09-30' },
      '2026-10-03',
    )
    expect(flat.mostImproved).toBeUndefined()
  })
})
