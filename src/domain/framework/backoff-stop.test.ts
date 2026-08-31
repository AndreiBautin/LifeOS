import { describe, expect, it } from 'vitest'

import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'
import type { LoggedSet, WorkoutLog } from '@/domain/logging/workout-log'

import { backoffStandingFor } from './backoff-stop'
import { BACKOFF_VARIANT, TOP_SET_VARIANT } from './replan-backoffs'

const SQUAT = asExerciseId('squat')

function set(over: Partial<LoggedSet> = {}): LoggedSet {
  return {
    prescription: { load: { kind: 'absolute', load: 100 }, reps: { kind: 'fixed', reps: 3 } },
    outcome: 'pending',
    isWarmup: false,
    ...over,
  }
}

function done(load: number, reps: number, rpe: number): LoggedSet {
  return set({ outcome: 'completed', actualLoad: load, actualReps: reps, actualRpe: rpe })
}

/** A back-off carrying the stop RPE its slot was planned with. */
function backoff(load: number, reps: number, rpe: number, stopRpe = 8): LoggedSet {
  return {
    ...done(load, reps, rpe),
    prescription: {
      load: { kind: 'rts-backoff', dropPercent: 5, topSetReps: 3, topSetRpe: 8, stopRpe },
      reps: { kind: 'fixed', reps: 3 },
    },
  }
}

function log(top: readonly LoggedSet[], backoffs: readonly LoggedSet[]): WorkoutLog {
  return {
    id: asWorkoutId('w'),
    date: '2026-08-31',
    startedAt: '2026-08-31T09:00:00.000Z',
    status: 'in-progress',
    title: 'Lower 1',
    entries: [
      { exerciseId: SQUAT, role: 'strength', variant: TOP_SET_VARIANT, order: 1, sets: top },
      { exerciseId: SQUAT, role: 'strength', variant: BACKOFF_VARIANT, order: 2, sets: backoffs },
    ],
  }
}

describe('reading the stopping rule off the log', () => {
  /*
   * The report: RPE 8 on the second back-off and nothing happened. The
   * whole live half of RTS had no caller — the app printed advice about
   * a rule it never evaluated.
   */
  it('says to stop on the set that reaches the target', () => {
    /*
     * Exactly what was reported. A 5% lighter bar at matched reps and
     * RPE *is* the 5% drop — that equality is the whole reason the
     * stopping rule is sayable — so the first back-off that comes back
     * at the top set's RPE is the last one.
     */
    const standing = backoffStandingFor(
      log([done(300, 3, 8)], [done(285, 3, 6), done(285, 3, 8), set()]),
      SQUAT,
      5,
    )

    expect(standing?.state.shouldStop).toBe(true)
    expect(standing?.remaining).toBe(1)
  })

  it('keeps going while the bar still feels easier than the top set did', () => {
    const standing = backoffStandingFor(log([done(300, 3, 8)], [done(285, 3, 6), set()]), SQUAT, 5)

    expect(standing?.state.shouldStop).toBe(false)
  })

  /*
   * Absent, never guessed. Every figure is measured against the implied
   * max of the top set, so without one the rule would fire on a number
   * nobody produced.
   */
  it('says nothing until the top set has been performed', () => {
    expect(backoffStandingFor(log([set()], [set(), set()]), SQUAT, 5)).toBeUndefined()
  })

  it('says nothing when the top set has no RPE to read', () => {
    const noRpe = set({ outcome: 'completed', actualLoad: 300, actualReps: 3 })

    expect(backoffStandingFor(log([noRpe], [set()]), SQUAT, 5)).toBeUndefined()
  })

  it('ignores a back-off logged without an RPE rather than scoring it as zero', () => {
    const blind = set({ outcome: 'completed', actualLoad: 285, actualReps: 3 })
    const standing = backoffStandingFor(log([done(300, 3, 8)], [blind, set()]), SQUAT, 5)

    expect(standing?.state.backoffSetsDone).toBe(0)
  })

  /*
   * A target of none means the top set is the work, which the planner
   * already handles by materialising no back-off slots at all. If one
   * exists anyway — an older log — the rule still says stop.
   */
  it('stops immediately at a target of none', () => {
    const standing = backoffStandingFor(log([done(300, 3, 8)], [set()]), SQUAT, 0)

    expect(standing?.state.shouldStop).toBe(true)
  })

  it('says nothing about an exercise with no back-off entry', () => {
    expect(backoffStandingFor(log([done(300, 3, 8)], []), asExerciseId('bench'), 5)).toBeUndefined()
  })
})

/*
 * The defect a real session found, and the reason it hid: the printed
 * rule and the evaluated rule were not the same rule.
 *
 * A 305 top set drops 5% to 289.75 and rounds to 290 — a bar you can
 * actually load, and 4.92% lighter rather than 5%. At matched reps and
 * RPE the implied-max drop equals the bar drop, so RPE 8 accumulated
 * 4.92% against a 5% target and the arithmetic said keep going while the
 * screen said stop.
 */
describe('the rule as it is printed', () => {
  it('stops at the RPE the lifter was told to watch for', () => {
    const standing = backoffStandingFor(
      log([done(305, 3, 8)], [backoff(290, 3, 6), backoff(290, 3, 8), set()]),
      SQUAT,
      5,
    )

    expect(standing?.state.shouldStop).toBe(true)
    expect(standing?.state.reason).toContain('RPE 8')
  })

  it('does not stop below that RPE', () => {
    const standing = backoffStandingFor(
      log([done(305, 3, 8)], [backoff(290, 3, 6), set()]),
      SQUAT,
      5,
    )

    expect(standing?.state.shouldStop).toBe(false)
  })

  /*
   * It only ever adds a reason to stop. The arithmetic still owns the
   * other two — target reached, and the set cap — so a log with no stop
   * RPE behaves exactly as it did.
   */
  it('still stops on the arithmetic when no stop RPE was recorded', () => {
    const standing = backoffStandingFor(log([done(300, 3, 8)], [done(280, 3, 8), set()]), SQUAT, 5)

    expect(standing?.state.shouldStop).toBe(true)
  })
})
