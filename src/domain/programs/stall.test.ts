import { describe, expect, it } from 'vitest'

import { asExerciseId } from '@/domain/ids/ids'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'
import { shiftDay } from '@/domain/time/day'

import {
  isStalled,
  resetLoad,
  resetPending,
  sessionsWithoutProgress,
  stalledExercises,
} from './stall'

const top = (load: number, reps: number) => ({ load, reps })

describe('a stalled exercise', () => {
  it('counts the sessions in a row, ending now, that did not beat the best before them', () => {
    expect(
      sessionsWithoutProgress([top(200, 8), top(205, 6), top(205, 6), top(205, 5), top(205, 6)]),
    ).toBe(3)
  })

  /*
   * Bouncing 6, 5, 6 beats the session before on every rebound. Measured
   * against the session before, this never stalled; it is not progress.
   */
  it('does not count getting back to where you were as progress', () => {
    expect(isStalled([top(205, 6), top(205, 5), top(205, 6), top(205, 5), top(205, 6)])).toBe(true)
  })

  it('is three of those', () => {
    expect(isStalled([top(205, 6), top(205, 6), top(205, 6), top(205, 6)])).toBe(true)
    expect(isStalled([top(205, 6), top(205, 6), top(205, 6)])).toBe(false)
  })

  /* One rep more at the same bar is the method working, and resets the count. */
  it('is not stalled by a session that added a rep', () => {
    expect(isStalled([top(205, 6), top(205, 6), top(205, 6), top(205, 7)])).toBe(false)
  })

  it('is not stalled across a bump in load', () => {
    expect(sessionsWithoutProgress([top(205, 10), top(210, 6), top(210, 6)])).toBe(1)
  })
})

/*
 * After a reset every session is lighter than the old best; measured
 * against it, the exercise would read as stalled again at once.
 */
it('starts a new climb from a lighter bar', () => {
  expect(
    sessionsWithoutProgress([top(225, 5), top(225, 5), top(225, 5), top(225, 5), top(200, 8)]),
  ).toBe(0)
})

describe('a pending reset', () => {
  const reset = { load: 200, at: '2026-09-01T18:00:00.000Z' }
  it('holds until a session starts after it was accepted — the same day included', () => {
    expect(resetPending(reset, '2026-09-01T09:00:00.000Z')).toBe(true)
    expect(resetPending(reset, undefined)).toBe(true)
    expect(resetPending(reset, '2026-09-03T09:00:00.000Z')).toBe(false)
  })
})

describe('the reset', () => {
  it('drops about a tenth, rounded down to something loadable', () => {
    expect(resetLoad(225, 5)).toBe(200)
    expect(resetLoad(102.5, 2.5)).toBe(90)
  })
})

describe('stalls across the training', () => {
  const week = (at: number, load: number, id: string) =>
    aWorkout({
      date: shiftDay('2026-09-07', at * 7),
      startedAt: `${shiftDay('2026-09-07', at * 7)}T09:00:00.000Z`,
      entries: [
        anEntry({
          exerciseId: asExerciseId(id),
          sets: [aSet({ actualLoad: load, actualReps: 5 })],
        }),
      ],
    })

  it('names the exercises trained lately that have stopped beating their best', () => {
    const stuck = [0, 1, 2, 3].map((at) => week(at, 200, 'bench-press'))
    const moving = [0, 1, 2, 3].map((at) => week(at, 100 + at * 5, 'barbell-row'))
    expect(stalledExercises([...stuck, ...moving], '2026-10-01')).toEqual(['bench-press'])
  })

  it('ignores a stall on an exercise not trained for three weeks', () => {
    const old = [0, 1, 2, 3].map((at) => week(at, 200, 'bench-press'))
    expect(stalledExercises(old, '2026-11-30')).toEqual([])
  })
})
