import { describe, expect, it } from 'vitest'

import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { sessionDetail, type SessionDetailDeps } from './session-detail'

const bench = asExerciseId('bench-press')

function repository(logs: readonly WorkoutLog[]): SessionDetailDeps {
  return {
    workouts: {
      byId: (id) => Promise.resolve(logs.find((log) => log.id === id)),
      forExercise: (id) =>
        Promise.resolve(logs.filter((log) => log.entries.some((e) => e.exerciseId === id))),
    },
  }
}

const benched = (id: string, startedAt: string, load: number, reps: number) =>
  aWorkout({
    id: asWorkoutId(id),
    date: startedAt.slice(0, 10),
    startedAt,
    completedAt: new Date(new Date(startedAt).getTime() + 50 * 60_000).toISOString(),
    entries: [
      anEntry({
        exerciseId: bench,
        sets: [
          aSet({ actualLoad: load, actualReps: reps, outcome: 'completed' }),
          aSet({ actualLoad: load, actualReps: reps - 1, outcome: 'completed' }),
        ],
      }),
    ],
  })

describe('opening a past session', () => {
  it('judges it against the session before it, not the newest', async () => {
    const logs = [
      benched('june', '2026-06-01T09:00:00Z', 200, 5),
      benched('july', '2026-07-01T09:00:00Z', 205, 5),
      benched('oct', '2026-10-01T09:00:00Z', 230, 3),
    ]
    const detail = await sessionDetail(asWorkoutId('july'), repository(logs))

    expect(detail?.minutes).toBe(50)
    expect(detail?.entries[0]?.top).toEqual({ load: 205, reps: 5 })
    expect(detail?.entries[0]?.previous).toEqual({ load: 200, reps: 5 })
    expect(detail?.entries[0]?.versus).toEqual({ kind: 'heavier', by: 5 })
  })

  it('has no comparison for the first time an exercise was done', async () => {
    const logs = [benched('june', '2026-06-01T09:00:00Z', 200, 5)]
    const detail = await sessionDetail(asWorkoutId('june'), repository(logs))

    expect(detail?.entries[0]?.previous).toBeUndefined()
    expect(detail?.entries[0]?.versus).toBeUndefined()
  })

  it('reads a session that finished the moment it started as of unknown length', async () => {
    const instant = { ...benched('june', '2026-06-01T09:00:00Z', 200, 5) }
    const filed = { ...instant, completedAt: instant.startedAt }
    const detail = await sessionDetail(asWorkoutId('june'), repository([filed]))

    expect(detail?.minutes).toBeUndefined()
  })

  it('answers nothing for a session that is not there', async () => {
    expect(await sessionDetail(asWorkoutId('gone'), repository([]))).toBeUndefined()
  })
})
