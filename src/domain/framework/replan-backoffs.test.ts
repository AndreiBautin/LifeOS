import { describe, expect, it } from 'vitest'

import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'
import type { LogEntry, LoggedSet, WorkoutLog } from '@/domain/logging/workout-log'
import type { SetPrescription } from '@/domain/programs/prescription'

import { BACKOFF_VARIANT, replanBackoffs, TOP_SET_VARIANT } from './replan-backoffs'

/**
 * The bug these guard against is the one that makes RTS not RTS: a
 * back-off derived from the estimate that suggested the top set rather
 * than from the top set itself. It is silent — the number looks like a
 * number — so nothing but a test notices.
 */

const SQUAT = asExerciseId('low-bar-squat')

const topPrescription: SetPrescription = {
  load: { kind: 'rpe', target: 8 },
  reps: { kind: 'fixed', reps: 5 },
}

const backoffPrescription: SetPrescription = {
  load: { kind: 'rts-backoff', dropPercent: 5, topSetReps: 5, topSetRpe: 8, stopRpe: 8 },
  reps: { kind: 'fixed', reps: 5 },
}

function topSet(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    prescription: topPrescription,
    plannedLoad: 245,
    plannedReps: 5,
    outcome: 'pending',
    isWarmup: false,
    ...overrides,
  }
}

function backoff(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    prescription: backoffPrescription,
    plannedLoad: 235,
    plannedReps: 5,
    outcome: 'pending',
    isWarmup: false,
    ...overrides,
  }
}

function workout(entries: readonly LogEntry[]): WorkoutLog {
  return {
    id: asWorkoutId('w1'),
    date: '2026-08-25',
    title: 'Tuesday',
    status: 'in-progress',
    startedAt: '2026-08-25T09:00:00.000Z',
    entries,
  }
}

function pair(top: LoggedSet, backoffs: readonly LoggedSet[]): WorkoutLog {
  return workout([
    { exerciseId: SQUAT, role: 'strength', variant: TOP_SET_VARIANT, order: 0, sets: [top] },
    { exerciseId: SQUAT, role: 'strength', variant: BACKOFF_VARIANT, order: 1, sets: backoffs },
  ])
}

const options = { roundingIncrement: 5 }

function backoffsOf(log: WorkoutLog): readonly LoggedSet[] {
  return log.entries.find((entry) => entry.variant === BACKOFF_VARIANT)?.sets ?? []
}

describe('re-planning back-offs from the top set', () => {
  it('takes the drop off what was lifted, not off what was suggested', () => {
    // The reported case: suggested 245, actually squatted 305.
    const log = pair(
      topSet({ outcome: 'completed', actualLoad: 305, actualReps: 3, actualRpe: 9 }),
      [backoff(), backoff()],
    )

    const replanned = backoffsOf(replanBackoffs(log, options))

    // 305 × 0.95 = 289.75, rounded to the 5 lb the lifter owns.
    expect(replanned.map((set) => set.plannedLoad)).toEqual([290, 290])
    expect(replanned.map((set) => set.plannedLoad)).not.toContain(235)
  })

  it('matches the reps the top set actually got', () => {
    // Three, not the five that were planned. The stopping rule compares
    // implied maxes, which is only proportional to bar weight at matched
    // reps — five-rep back-offs under a three-rep top set break it.
    const log = pair(topSet({ outcome: 'completed', actualLoad: 305, actualReps: 3 }), [backoff()])

    expect(backoffsOf(replanBackoffs(log, options))[0]?.plannedReps).toBe(3)
  })

  it('leaves a back-off that has already been performed alone', () => {
    const done = backoff({
      outcome: 'completed',
      actualLoad: 235,
      actualReps: 5,
      plannedLoad: 235,
    })

    const log = pair(topSet({ outcome: 'completed', actualLoad: 305, actualReps: 3 }), [
      done,
      backoff(),
    ])

    const replanned = backoffsOf(replanBackoffs(log, options))

    // History is not rewritten to agree with a later reading.
    expect(replanned[0]?.plannedLoad).toBe(235)
    expect(replanned[0]?.actualLoad).toBe(235)
    expect(replanned[1]?.plannedLoad).toBe(290)
  })

  it('does nothing until the top set has actually been logged', () => {
    const log = pair(topSet(), [backoff(), backoff()])

    expect(replanBackoffs(log, options)).toBe(log)
  })

  it('does nothing when the top set was skipped', () => {
    const log = pair(topSet({ outcome: 'skipped' }), [backoff()])

    expect(replanBackoffs(log, options)).toBe(log)
  })

  it('refuses a half-recorded top set rather than inventing the other half', () => {
    // A weight with no reps cannot say what the back-off should be, and
    // filling the gap from the plan is how the estimate gets back in.
    const log = pair(topSet({ outcome: 'completed', actualLoad: 305 }), [backoff()])

    expect(replanBackoffs(log, options)).toBe(log)
  })

  it('does not touch a slot that is not an RTS back-off', () => {
    const straight: LoggedSet = {
      prescription: { load: { kind: 'rpe', target: 9 }, reps: { kind: 'fixed', reps: 8 } },
      plannedLoad: 135,
      plannedReps: 8,
      outcome: 'pending',
      isWarmup: false,
    }

    const log = pair(topSet({ outcome: 'completed', actualLoad: 305, actualReps: 3 }), [straight])

    expect(backoffsOf(replanBackoffs(log, options))[0]?.plannedLoad).toBe(135)
  })

  it('keeps each lift to its own top set', () => {
    const bench = asExerciseId('bench-press')

    const log = workout([
      {
        exerciseId: SQUAT,
        role: 'strength',
        variant: TOP_SET_VARIANT,
        order: 0,
        sets: [topSet({ outcome: 'completed', actualLoad: 305, actualReps: 3 })],
      },
      {
        exerciseId: SQUAT,
        role: 'strength',
        variant: BACKOFF_VARIANT,
        order: 1,
        sets: [backoff()],
      },
      {
        exerciseId: bench,
        role: 'strength',
        variant: BACKOFF_VARIANT,
        order: 2,
        sets: [backoff({ plannedLoad: 175 })],
      },
    ])

    const entries = replanBackoffs(log, options).entries

    expect(entries[1]?.sets[0]?.plannedLoad).toBe(290)
    // The bench has no logged top set in this session, so it is untouched.
    expect(entries[2]?.sets[0]?.plannedLoad).toBe(175)
  })

  it('returns the same object when there is nothing to change', () => {
    const already = backoff({ plannedLoad: 290, plannedReps: 3 })
    const log = pair(topSet({ outcome: 'completed', actualLoad: 305, actualReps: 3 }), [already])

    expect(replanBackoffs(log, options)).toBe(log)
  })
})
