import { describe, expect, it } from 'vitest'

import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { exerciseHistory, setsByWeek } from './exercise-history'

const calf = asExerciseId('barbell-calf-raise')

function session(
  id: string,
  startedAt: string,
  load: number,
  reps: number,
  variant?: string,
  status: WorkoutLog['status'] = 'completed',
): WorkoutLog {
  return aWorkout({
    id: asWorkoutId(id),
    date: startedAt.slice(0, 10),
    startedAt,
    status,
    entries: [
      anEntry({
        exerciseId: calf,
        ...(variant === undefined ? {} : { variant }),
        sets: [
          aSet({ actualLoad: load, actualReps: reps, outcome: 'completed' }),
          aSet({ actualLoad: load, actualReps: reps - 2, outcome: 'completed' }),
        ],
      }),
    ],
  })
}

describe('one exercise across its sessions', () => {
  it('keeps the heavy and light versions as two series, oldest first', () => {
    const series = exerciseHistory(
      [
        session('c', '2026-06-08T09:00:00Z', 210, 14, 'Heavy'),
        session('b', '2026-06-05T09:00:00Z', 150, 25, 'Light'),
        session('a', '2026-06-01T09:00:00Z', 200, 15, 'Heavy'),
      ],
      calf,
    )

    const heavy = series.find((one) => one.variant === 'Heavy')
    expect(heavy?.sessions.map((one) => one.workoutId)).toEqual(['a', 'c'])
    expect(heavy?.best).toEqual({ load: 210, reps: 14 })
    expect(series.find((one) => one.variant === 'Light')?.sessions).toHaveLength(1)
  })

  /*
   * A slot's variant is mostly a sub-category, not a version. Splitting
   * on it would put the same row in "Compound" and in "no variant".
   */
  it('does not split on a sub-category', () => {
    const series = exerciseHistory(
      [
        session('a', '2026-06-01T09:00:00Z', 200, 10),
        session('b', '2026-06-05T09:00:00Z', 205, 10, 'Compound'),
      ],
      calf,
    )
    expect(series).toHaveLength(1)
    expect(series[0]?.variant).toBeUndefined()
  })

  it('leaves out sessions that were abandoned or never reached it', () => {
    const untouched = aWorkout({
      id: asWorkoutId('x'),
      entries: [anEntry({ exerciseId: calf, sets: [aSet({ outcome: 'pending' })] })],
    })
    const series = exerciseHistory(
      [untouched, session('y', '2026-06-01T09:00:00Z', 200, 10, undefined, 'abandoned')],
      calf,
    )
    expect(series).toEqual([])
  })
})

describe('an exercise by week', () => {
  const session = (date: string, sets: number) => ({
    workoutId: asWorkoutId(date),
    date,
    startedAt: `${date}T09:00:00.000Z`,
    title: 'Upper',
    top: { load: 100, reps: 5 },
    sets: Array.from({ length: sets }, () => ({ load: 100, reps: 5 })),
  })

  it('counts each calendar week, a week untrained as nothing', () => {
    const weeks = setsByWeek([session('2026-09-21', 3), session('2026-09-30', 4)], '2026-10-02', 3)
    expect(weeks.map((week) => [week.monday, week.sets])).toEqual([
      ['2026-09-14', 0],
      ['2026-09-21', 3],
      ['2026-09-28', 4],
    ])
    expect(weeks[2]?.volume).toBe(2000)
  })
})
