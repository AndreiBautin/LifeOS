import { describe, expect, it } from 'vitest'

import type { Exercise } from '@/domain/exercises/exercise'
import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'

import { loggedVolume, type LogEntry, type LoggedSet, type WorkoutLog } from './workout-log'

/**
 * Credit is earned by what happened, not by what was asked for.
 *
 * This mattered little while the number only fed a history chart. It
 * matters now that the accessory work resizes against it: a lifter who
 * cuts a set short would otherwise have the app conclude the muscle was
 * covered and schedule nothing to replace it.
 */

const DIPS = asExerciseId('dips')

const dips: Exercise = {
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
}

const lookup = (id: string) => (id === (DIPS as string) ? dips : undefined)

function set(over: Partial<LoggedSet> = {}): LoggedSet {
  return {
    prescription: { load: { kind: 'rpe', target: 9 }, reps: { kind: 'fixed', reps: 5 } },
    outcome: 'completed',
    isWarmup: false,
    ...over,
  }
}

function workout(sets: readonly LoggedSet[]): WorkoutLog {
  const entry: LogEntry = { exerciseId: DIPS, role: 'hypertrophy', order: 0, sets }

  return {
    id: asWorkoutId('w1'),
    date: '2026-08-25',
    title: 'Monday',
    status: 'completed',
    startedAt: '2026-08-25T09:00:00.000Z',
    entries: [entry],
  }
}

const chest = (log: WorkoutLog) => loggedVolume(log, lookup).chest

describe('crediting a logged set', () => {
  /*
   * A set is a set, whatever it came in at.
   *
   * Reps and proximity to failure used to scale the credit, and both are
   * gone. What that costs is stated plainly rather than hidden: a set
   * planned for five and taken for three now counts the same, so the log
   * can report a muscle covered on work that fell short. The compensation
   * is that the number on the screen is one anybody can check by counting
   * rows, which the old one was not.
   */
  it('counts a set for one however it went', () => {
    const planned = chest(workout([set()]))
    const short = chest(workout([set({ actualReps: 3, actualRpe: 9 })]))
    const easy = chest(workout([set({ actualReps: 5, actualRpe: 6 })]))

    expect(short).toBe(planned)
    expect(easy).toBe(planned)
  })

  it('gives a set done as prescribed exactly what the plan expected', () => {
    expect(chest(workout([set({ actualReps: 5, actualRpe: 9 })]))).toBe(chest(workout([set()])))
  })

  it('falls back to the prescription when the lifter recorded no RPE', () => {
    /*
     * Reps are commonly logged without one. The prescribed target is what
     * they were aiming at and there is no better evidence, so it stands —
     * the alternative, assuming an easy set, would penalise the lifter for
     * not filling in a field.
     */
    const withRpe = chest(workout([set({ actualReps: 5, actualRpe: 9 })]))
    const without = chest(workout([set({ actualReps: 5 })]))

    expect(without).toBe(withRpe)
  })

  it('ignores warm-ups and unperformed sets', () => {
    const log = workout([
      set({ isWarmup: true, actualReps: 10 }),
      set({ outcome: 'pending' }),
      set({ outcome: 'skipped' }),
    ])

    expect(chest(log)).toBe(0)
  })

  it('pays a secondary muscle nothing', () => {
    const volume = loggedVolume(workout([set({ actualReps: 3, actualRpe: 9 })]), lookup)

    expect(volume.chest).toBe(1)
    expect(volume.triceps).toBe(0)
  })
})
