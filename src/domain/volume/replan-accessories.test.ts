import { describe, expect, it } from 'vitest'

import type { Exercise } from '@/domain/exercises/exercise'
import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'
import type { LogEntry, LoggedSet, WorkoutLog } from '@/domain/logging/workout-log'

import { MAX_ACCESSORY_SETS, replanAccessoryVolume } from './replan-accessories'

/**
 * The scenario throughout: a bench day where the back-offs were cut
 * short, and the dips that were scheduled on the assumption they would
 * not be.
 */

const BENCH = asExerciseId('bench-press')
const DIPS = asExerciseId('dips')

const library: Exercise[] = [
  {
    id: BENCH,
    name: 'Bench Press',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps'],
    equipment: 'barbell',
    pattern: 'horizontal-push',
    isCompound: true,
    intent: 'strength',
    sfr: 3,
    systemicCost: 0.5,
    safeToFail: false,
    isUnilateral: false,
    isCompetition: false,
    loadBasis: 'training-max',
    isBuiltIn: true,
    isArchived: false,
  },
  {
    id: DIPS,
    name: 'Dips',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps'],
    equipment: 'bodyweight',
    pattern: 'vertical-push',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 4,
    systemicCost: 0.3,
    safeToFail: true,
    isUnilateral: false,
    isCompetition: false,
    loadBasis: 'bodyweight',
    isBuiltIn: true,
    isArchived: false,
  },
]

const lookup = (id: string) => library.find((exercise) => exercise.id === id)

function set(outcome: LoggedSet['outcome']): LoggedSet {
  return {
    prescription: { load: { kind: 'rpe', target: 9 }, reps: { kind: 'fixed', reps: 5 } },
    outcome,
    isWarmup: false,
  }
}

function workout(entries: readonly LogEntry[], chest: number): WorkoutLog {
  return {
    id: asWorkoutId('w1'),
    date: '2026-08-25',
    title: 'Monday',
    status: 'in-progress',
    startedAt: '2026-08-25T09:00:00.000Z',
    entries,
    volumeTargets: { chest },
  }
}

const bench = (outcomes: LoggedSet['outcome'][]): LogEntry => ({
  exerciseId: BENCH,
  role: 'strength',
  order: 0,
  sets: outcomes.map(set),
})

const dips = (outcomes: LoggedSet['outcome'][]): LogEntry => ({
  exerciseId: DIPS,
  role: 'hypertrophy',
  order: 1,
  sets: outcomes.map(set),
})

const setsOn = (log: WorkoutLog, index: number) => log.entries[index]?.sets.length

describe('resizing the accessory work', () => {
  it('leaves everything alone while the strength sets are merely unlogged', () => {
    /*
     * The property the whole design rests on. A pending back-off and a
     * back-off you are about to do are indistinguishable, so nothing may
     * move until the lifter says the strength work is over.
     */
    const log = workout([bench(['pending', 'pending', 'pending']), dips(['pending', 'pending'])], 5)

    expect(replanAccessoryVolume(log, lookup)).toBe(log)
  })

  it('grows the accessory when the back-offs are skipped', () => {
    // Two of the three bench sets refused: the chest is short, and dips
    // are the exercise that trains it directly.
    const log = workout(
      [bench(['completed', 'skipped', 'skipped']), dips(['pending', 'pending'])],
      5,
    )

    const after = replanAccessoryVolume(log, lookup)

    expect(setsOn(after, 1)).toBeGreaterThan(2)
    expect(setsOn(after, 0)).toBe(3)
  })

  it('does not touch the strength work itself', () => {
    const log = workout(
      [bench(['completed', 'skipped', 'skipped']), dips(['pending', 'pending'])],
      5,
    )

    expect(replanAccessoryVolume(log, lookup).entries[0]).toEqual(log.entries[0])
  })

  it('lands on the same answer however many times it runs', () => {
    /*
     * It runs after every logged set. An implementation that added one
     * more each time would ratchet upward on every keystroke, so the
     * count is solved from the rest of the session rather than nudged.
     */
    const log = workout(
      [bench(['completed', 'skipped', 'skipped']), dips(['pending', 'pending'])],
      5,
    )

    const once = replanAccessoryVolume(log, lookup)
    const twice = replanAccessoryVolume(once, lookup)

    expect(twice).toBe(once)
  })

  it('shrinks again if the skipped sets are put back', () => {
    const cut = workout(
      [bench(['completed', 'skipped', 'skipped']), dips(['pending', 'pending'])],
      5,
    )
    const grown = replanAccessoryVolume(cut, lookup)

    const regrown = grown.entries[1]
    if (regrown === undefined) throw new Error('expected a resized accessory')

    const restored: WorkoutLog = {
      ...grown,
      entries: [bench(['completed', 'pending', 'pending']), regrown],
    }
    const after = replanAccessoryVolume(restored, lookup)

    expect(setsOn(after, 1)).toBeLessThan(setsOn(grown, 1) ?? 0)
  })

  it('never drops a set that has already been performed', () => {
    // History is not negotiable, even when the arithmetic says the
    // exercise is now larger than it needs to be.
    const log = workout(
      [
        bench(['completed', 'completed', 'completed']),
        dips(['completed', 'completed', 'completed']),
      ],
      1,
    )

    expect(setsOn(replanAccessoryVolume(log, lookup), 1)).toBe(3)
  })

  it('stops at the ceiling rather than meeting the target at any cost', () => {
    // A session whose strength work collapsed entirely. Filling until the
    // number is met produces a number that is met and a session nobody
    // would do.
    const log = workout([bench(['skipped', 'skipped', 'skipped']), dips(['pending'])], 40)

    expect(setsOn(replanAccessoryVolume(log, lookup), 1)).toBe(MAX_ACCESSORY_SETS)
  })

  it('does nothing for a session with no targets', () => {
    // Freestyle sessions, and anything logged before targets existed.
    const { volumeTargets: _omitted, ...rest } = workout([dips(['pending'])], 5)
    const log: WorkoutLog = rest

    expect(replanAccessoryVolume(log, lookup)).toBe(log)
  })
})
