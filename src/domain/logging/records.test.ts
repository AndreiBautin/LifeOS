import { describe, expect, it } from 'vitest'

import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { recordFor, sessionRecords } from './records'

describe('a personal record', () => {
  it('is the heaviest bar ever, first of all', () => {
    expect(recordFor({ load: 230, reps: 1 }, [{ load: 225, reps: 5 }])).toBe('heaviest')
  })

  it('is more reps than ever at a bar at least this heavy', () => {
    const before = [
      { load: 225, reps: 5 },
      { load: 205, reps: 8 },
    ]
    expect(recordFor({ load: 225, reps: 6 }, before)).toBe('reps')
    // Nine at 205 beats eight at 205, and the 225 × 5 never did nine.
    expect(recordFor({ load: 205, reps: 9 }, before)).toBe('reps')
    // Six at 185 beats nothing: eight at 205 is more reps at more weight.
    expect(recordFor({ load: 185, reps: 6 }, before)).toBeUndefined()
  })

  /*
   * The estimated-max record this replaced could not fire alone: an
   * estimate above every earlier one needs more reps than any earlier set
   * at a bar at least as heavy, which is this rule.
   */
  it('names a set that beats the old best estimate as the rep record it is', () => {
    expect(
      recordFor({ load: 220, reps: 7 }, [
        { load: 225, reps: 3 },
        { load: 200, reps: 8 },
      ]),
    ).toBe('reps')
  })

  it('is never the first time an exercise is done', () => {
    expect(recordFor({ load: 500, reps: 5 }, [])).toBeUndefined()
  })

  it('treats a missing load as the body alone', () => {
    expect(recordFor({ reps: 12 }, [{ reps: 10 }])).toBe('reps')
  })
})

describe('records through history', () => {
  const bench = asExerciseId('bench-press')
  const session = (id: string, startedAt: string, ...sets: [number, number][]): WorkoutLog =>
    aWorkout({
      id: asWorkoutId(id),
      startedAt,
      entries: [
        anEntry({
          exerciseId: bench,
          sets: sets.map(([load, reps]) =>
            aSet({ actualLoad: load, actualReps: reps, outcome: 'completed' }),
          ),
        }),
      ],
    })

  it('judges each session against everything before it, one record per exercise', () => {
    const records = sessionRecords([
      session('c', '2026-06-15T09:00:00Z', [230, 3], [230, 4]),
      session('a', '2026-06-01T09:00:00Z', [225, 5]),
      session('b', '2026-06-08T09:00:00Z', [225, 5], [225, 6]),
    ])

    expect(records.get(asWorkoutId('a'))).toBeUndefined()
    expect(records.get(asWorkoutId('b'))?.map((one) => one.kind)).toEqual(['reps'])
    // Heaviest outranks the rep record the second set also set.
    expect(records.get(asWorkoutId('c'))).toEqual([
      { exerciseId: bench, kind: 'heaviest', set: { load: 230, reps: 3 } },
    ])
  })
})
