import { describe, expect, it } from 'vitest'

import { builtInExercises } from '@/domain/exercises/catalogue'
import { asExerciseId, asSlotId, asWorkoutId } from '@/domain/ids/ids'
import type { LoggedSet, WorkoutLog } from '@/domain/logging/workout-log'
import type { ExerciseRepository, WorkoutRepository } from '@/domain/repositories/ports'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { swapExercise, swapOptions } from './swap-exercise'

const ROW = asExerciseId('barbell-row')
const PENDLAY = asExerciseId('pendlay-row')
const range = { load: { kind: 'open' }, reps: { kind: 'range', low: 5, high: 10 } } as const

const pendingSet = (): LoggedSet =>
  aSet({
    prescription: range as unknown as LoggedSet['prescription'],
    plannedLoad: 155,
    plannedReps: 8,
    outcome: 'pending',
  })

function harness(open: WorkoutLog, ...history: readonly WorkoutLog[]) {
  let saved = open
  const workouts = {
    byId: () => Promise.resolve(saved),
    forExercise: (id: string) =>
      Promise.resolve(
        [saved, ...history].filter((log) => log.entries.some((entry) => entry.exerciseId === id)),
      ),
    save: (log: WorkoutLog) => {
      saved = log
      return Promise.resolve()
    },
  } as unknown as WorkoutRepository
  const exercises = {
    all: () => Promise.resolve(builtInExercises()),
  } as unknown as ExerciseRepository
  return { deps: { workouts, exercises }, saved: () => saved }
}

const openSession = (sets: readonly LoggedSet[]) =>
  aWorkout({
    id: asWorkoutId('today'),
    status: 'in-progress',
    entries: [anEntry({ exerciseId: ROW, role: 'hypertrophy', order: 0, sets })],
  })

/* Pendlay rows last time: every set at the top of 5–10. */
const pendlayLastWeek = aWorkout({
  id: asWorkoutId('last-week'),
  entries: [
    anEntry({
      exerciseId: PENDLAY,
      role: 'hypertrophy',
      sets: [1, 2, 3].map(() =>
        aSet({
          prescription: range as unknown as LoggedSet['prescription'],
          actualLoad: 185,
          actualReps: 10,
        }),
      ),
    }),
  ],
})

describe('swapping an exercise', () => {
  it('files the slot under what was done and plans it from its own history', async () => {
    const { deps, saved } = harness(openSession([pendingSet(), pendingSet()]), pendlayLastWeek)
    await swapExercise(
      { workoutId: asWorkoutId('today'), entryIndex: 0, exerciseId: PENDLAY },
      deps,
    )

    const [entry] = saved().entries
    expect(entry?.exerciseId).toBe(PENDLAY)
    expect(entry?.substitutedFor).toBe(ROW)
    // Topped last time: the next increment, back at the bottom of the range.
    expect(entry?.sets.map((set) => [set.plannedLoad, set.plannedReps])).toEqual([
      [190, 5],
      [190, 5],
    ])
  })

  it('opens with no weight on an exercise never done', async () => {
    const { deps, saved } = harness(openSession([pendingSet()]))
    await swapExercise(
      { workoutId: asWorkoutId('today'), entryIndex: 0, exerciseId: PENDLAY },
      deps,
    )

    expect(saved().entries[0]?.sets[0]?.plannedLoad).toBeUndefined()
  })

  /*
   * Relabelling the two rows already logged would credit Pendlay rows
   * with work they never had.
   */
  it('leaves sets already done under the exercise they were done on', async () => {
    const done = aSet({ actualLoad: 155, actualReps: 8 })
    const { deps, saved } = harness(openSession([done, pendingSet(), pendingSet()]))
    await swapExercise(
      { workoutId: asWorkoutId('today'), entryIndex: 0, exerciseId: PENDLAY },
      deps,
    )

    const [kept, moved] = saved().entries
    expect(kept?.exerciseId).toBe(ROW)
    expect(kept?.sets).toEqual([done])
    expect(moved?.exerciseId).toBe(PENDLAY)
    expect(moved?.sets).toHaveLength(2)
  })

  it('clears the mark when swapped back to what was programmed', async () => {
    const { deps, saved } = harness(openSession([pendingSet()]))
    const request = { workoutId: asWorkoutId('today'), entryIndex: 0 }
    await swapExercise({ ...request, exerciseId: PENDLAY }, deps)
    await swapExercise({ ...request, exerciseId: ROW }, deps)

    expect(saved().entries[0]?.exerciseId).toBe(ROW)
    expect(saved().entries[0]?.substitutedFor).toBeUndefined()
  })

  it('rejoins the slot when swapped back after a split', async () => {
    const done = aSet({ actualLoad: 155, actualReps: 8 })
    const open = aWorkout({
      id: asWorkoutId('today'),
      status: 'in-progress',
      entries: [
        anEntry({
          exerciseId: ROW,
          role: 'hypertrophy',
          slotId: asSlotId('slot-1'),
          sets: [done, pendingSet(), pendingSet()],
        }),
      ],
    })
    const { deps, saved } = harness(open)
    await swapExercise(
      { workoutId: asWorkoutId('today'), entryIndex: 0, exerciseId: PENDLAY },
      deps,
    )
    await swapExercise({ workoutId: asWorkoutId('today'), entryIndex: 1, exerciseId: ROW }, deps)

    expect(saved().entries).toHaveLength(1)
    expect(saved().entries[0]?.sets).toHaveLength(3)
    expect(saved().entries[0]?.sets[0]).toEqual(done)
  })

  it('refuses when nothing is left to do', async () => {
    const { deps } = harness(openSession([aSet()]))
    await expect(
      swapExercise({ workoutId: asWorkoutId('today'), entryIndex: 0, exerciseId: PENDLAY }, deps),
    ).rejects.toThrow()
  })
})

describe('what a swap offers', () => {
  it('trains the same muscle, the same movement first, and says what it did last time', async () => {
    const { deps } = harness(openSession([pendingSet()]), pendlayLastWeek)
    const options = await swapOptions(anEntry({ exerciseId: ROW }), deps)
    const row = builtInExercises().find((one) => one.id === ROW)

    expect(options.every((one) => one.exercise.primaryMuscle === row?.primaryMuscle)).toBe(true)
    expect(options[0]?.exercise.pattern).toBe(row?.pattern)
    expect(options.find((one) => one.exercise.id === PENDLAY)?.last?.load).toBe(185)
  })

  it('does not offer a warm-up for a lift', async () => {
    const { deps } = harness(openSession([pendingSet()]))
    const options = await swapOptions(anEntry({ exerciseId: asExerciseId('front-squat') }), deps)
    expect(options.length).toBeGreaterThan(0)
    expect(options.some((one) => one.exercise.intent === 'conditioning')).toBe(false)
  })

  it('offers the programmed exercise back first after a swap', async () => {
    const { deps } = harness(openSession([pendingSet()]))
    const options = await swapOptions(anEntry({ exerciseId: PENDLAY, substitutedFor: ROW }), deps)
    expect(options[0]?.exercise.id).toBe(ROW)
    expect(options[0]?.programmed).toBe(true)
  })
})
