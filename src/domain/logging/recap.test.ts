import { describe, expect, it } from 'vitest'

import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { weekRecap } from './recap'

const bench = asExerciseId('bench-press')

function benched(
  id: string,
  date: string,
  load: number,
  reps: number,
  status: WorkoutLog['status'] = 'completed',
): WorkoutLog {
  return aWorkout({
    id: asWorkoutId(id),
    date,
    startedAt: `${date}T09:00:00Z`,
    status,
    entries: [
      anEntry({
        exerciseId: bench,
        sets: [
          aSet({ actualLoad: load, actualReps: reps, outcome: 'completed' }),
          aSet({ actualLoad: load, actualReps: reps, outcome: 'completed' }),
        ],
      }),
    ],
  })
}

// Wednesday 21 January 2026: last week ran Monday 12th to Sunday 18th.
const TODAY = '2026-01-21'

describe('last week, against the week before', () => {
  it('totals each calendar week and spreads the volume by day', () => {
    const recap = weekRecap(
      [
        benched('a', '2026-01-06', 200, 5), // the week before
        benched('b', '2026-01-12', 205, 5), // last Monday
        benched('c', '2026-01-15', 210, 5), // last Thursday
        benched('d', '2026-01-19', 215, 5), // this week, not counted
      ],
      TODAY,
    )

    expect(recap?.last.monday).toBe('2026-01-12')
    expect(recap?.last.sessions).toBe(2)
    expect(recap?.last.sets).toBe(4)
    expect(recap?.last.byDay).toEqual([2050, 0, 0, 2100, 0, 0, 0])
    expect(recap?.before.sessions).toBe(1)
  })

  it('counts an exercise once when it moved, and the records set', () => {
    const recap = weekRecap(
      [
        benched('a', '2026-01-06', 200, 5),
        benched('b', '2026-01-12', 205, 5),
        benched('c', '2026-01-15', 210, 5),
      ],
      TODAY,
    )
    // Bench went up twice last week: one exercise progressed, two records.
    expect(recap?.progressed).toBe(1)
    expect(recap?.records).toBe(2)
  })

  it('has nothing to say about a week with no finished session', () => {
    expect(weekRecap([benched('a', '2026-01-13', 200, 5, 'abandoned')], TODAY)).toBeUndefined()
  })
})
