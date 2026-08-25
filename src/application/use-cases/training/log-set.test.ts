import { describe, expect, it } from 'vitest'

import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { Clock, WorkoutRepository } from '@/domain/repositories/ports'
import { previousSetFor } from '@/application/use-cases/training/log-set'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

/**
 * What the app offers as the placeholder when a set is opened.
 *
 * The number a lifter beats without thinking about it, which is the whole
 * point — and therefore a number that must be the *right* previous set,
 * because nothing on screen says which one it came from.
 */

const SQUAT = asExerciseId('low-bar-squat')

function repositoryOf(...workouts: readonly WorkoutLog[]) {
  const workoutsRepo = {
    forExercise: () => Promise.resolve(workouts),
  } as unknown as WorkoutRepository

  const clock: Clock = { now: () => new Date('2026-08-25T09:00:00.000Z') }
  return { workouts: workoutsRepo, clock, roundingIncrement: 5 }
}

/*
 * The failure this pins down. Splitting the competition lift into a
 * top-set slot and a back-off slot put the same exercise in a session
 * twice; matching on the exercise alone took the *first* entry, so the
 * first back-off was offered the previous session's top set as its "last
 * time" — a heavier number, silently, on the one row where the lifter is
 * deciding what to load.
 */
describe('the previous set for a lift that appears twice in a session', () => {
  const history = aWorkout({
    id: asWorkoutId('last-week'),
    date: '2026-08-18',
    entries: [
      anEntry({
        exerciseId: SQUAT,
        role: 'strength',
        variant: 'Top set',
        order: 0,
        sets: [aSet({ actualLoad: 285, actualReps: 5 })],
      }),
      anEntry({
        exerciseId: SQUAT,
        role: 'strength',
        variant: 'Back-off',
        order: 1,
        sets: [aSet({ actualLoad: 270, actualReps: 5 })],
      }),
    ],
  })

  it('offers the back-off row the previous back-off', async () => {
    const previous = await previousSetFor(
      SQUAT,
      0,
      asWorkoutId('today'),
      repositoryOf(history),
      'Back-off',
    )

    expect(previous?.load).toBe(270)
  })

  it('offers the top-set row the previous top set', async () => {
    const previous = await previousSetFor(
      SQUAT,
      0,
      asWorkoutId('today'),
      repositoryOf(history),
      'Top set',
    )

    expect(previous?.load).toBe(285)
  })

  it('falls back to the first entry for a log that predates variants', async () => {
    const older = aWorkout({
      id: asWorkoutId('long-ago'),
      entries: [
        anEntry({ exerciseId: SQUAT, role: 'strength', sets: [aSet({ actualLoad: 255 })] }),
      ],
    })

    const previous = await previousSetFor(
      SQUAT,
      0,
      asWorkoutId('today'),
      repositoryOf(older),
      'Back-off',
    )

    expect(previous?.load).toBe(255)
  })

  it('never compares a session against itself', async () => {
    const previous = await previousSetFor(
      SQUAT,
      0,
      asWorkoutId('last-week'),
      repositoryOf(history),
      'Top set',
    )

    expect(previous).toBeUndefined()
  })
})
