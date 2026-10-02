import { describe, expect, it } from 'vitest'

import {
  lastPerformance,
  nextLoad,
  plannedRepsFor,
  STRENGTH_RANGE,
  topped,
  type Performance,
} from './progression'

const did = (load: number, ...reps: number[]): Performance => ({ load, reps })

describe('topped', () => {
  it('is true when every set reached the top of the range', () => {
    expect(topped(did(225, 5, 5, 5), STRENGTH_RANGE, 3)).toBe(true)
  })

  it('is false when one set fell short', () => {
    expect(topped(did(225, 5, 5, 4), STRENGTH_RANGE, 3)).toBe(false)
  })

  /*
   * A session cut short is not a completed prescription. Adding load for
   * two sets out of three would progress off work that did not happen.
   */
  it('is false when fewer sets were done than asked for', () => {
    expect(topped(did(225, 5, 5), STRENGTH_RANGE, 3)).toBe(false)
  })

  /*
   * At or above. Refusing the increment because somebody did 16 instead
   * of 15 would be the app being pedantic about its own bookkeeping.
   */
  it('counts an overshoot as having earned it', () => {
    expect(topped(did(225, 6, 5, 7), STRENGTH_RANGE, 3)).toBe(true)
  })
})

describe('nextLoad', () => {
  it('adds the step once the range is topped', () => {
    expect(nextLoad(did(225, 5, 5, 5), STRENGTH_RANGE, 10, 3)).toBe(235)
  })

  it('holds the load while the reps are still climbing', () => {
    expect(nextLoad(did(225, 5, 4, 3), STRENGTH_RANGE, 10, 3)).toBe(225)
  })

  /*
   * Absent means open, which is the design rather than a gap: with no
   * history the app does not know what you lift, and inventing a number
   * would be a prescription nobody chose.
   */
  it('is absent with no history at all', () => {
    expect(nextLoad(undefined, STRENGTH_RANGE, 10)).toBeUndefined()
  })

  /* Two sessions of topping it out move it twice, not once. */
  it('compounds across sessions', () => {
    const first = nextLoad(did(225, 5, 5, 5), STRENGTH_RANGE, 10, 3) ?? 0
    expect(nextLoad(did(first, 5, 5, 5), STRENGTH_RANGE, 10, 3)).toBe(245)
  })
})

describe('lastPerformance', () => {
  it('reads the reps done at the heaviest load', () => {
    expect(
      lastPerformance([
        { load: 225, reps: 5 },
        { load: 225, reps: 4 },
      ]),
    ).toEqual({
      load: 225,
      reps: [5, 4],
    })
  })

  /*
   * Warm-ups and lighter sets share the entry. Averaging across them
   * would progress off a load nobody worked at.
   */
  it('ignores the lighter sets under the top load', () => {
    const reading = lastPerformance([
      { load: 135, reps: 5 },
      { load: 185, reps: 3 },
      { load: 225, reps: 5 },
      { load: 225, reps: 5 },
    ])

    expect(reading).toEqual({ load: 225, reps: [5, 5] })
  })

  it('is absent when nothing was actually logged', () => {
    expect(lastPerformance([])).toBeUndefined()
    expect(lastPerformance([{ reps: 5 }, { load: 225 }])).toBeUndefined()
  })

  /*
   * A pending set carries no reps and must not read as a set of nought,
   * which would make a started-and-abandoned session look like a failure
   * to progress rather than a session that did not happen.
   */
  it('ignores a set with no reps recorded', () => {
    expect(lastPerformance([{ load: 225, reps: 5 }, { load: 225 }])).toEqual({
      load: 225,
      reps: [5],
    })
  })
})

describe('plannedRepsFor', () => {
  const range = { low: 5, high: 30 }

  /*
   * One target for every set. Per-set targets turned 16, 16, 16, 15, 15
   * into 17, 17, 17, 16, 16 — five numbers for one weight.
   */
  it('plans one past the weakest set, the same on every set', () => {
    expect(plannedRepsFor({ load: 25, reps: [16, 16, 16, 15, 15] }, range, false)).toBe(16)
    expect(plannedRepsFor({ load: 25, reps: [16, 16, 16, 16, 16] }, range, false)).toBe(17)
  })

  it('does not plan past the top of the range', () => {
    expect(plannedRepsFor({ load: 25, reps: [30, 30, 29] }, range, false)).toBe(30)
  })

  it('starts back at the bottom once the load has gone up', () => {
    expect(plannedRepsFor({ load: 25, reps: [30, 30, 30, 30, 30] }, range, true)).toBe(5)
  })

  it('plans the bottom when last time fell short of it, or there is no last time', () => {
    expect(plannedRepsFor({ load: 25, reps: [3] }, range, false)).toBe(5)
    expect(plannedRepsFor(undefined, range, false)).toBe(5)
  })
})

describe('lastPerformance on a bodyweight exercise', () => {
  /*
   * Pull-ups and dips are logged with reps and no load. Requiring a load
   * read a month of them as no history, and the session planned nothing.
   */
  it('reads a set with no load as the body alone', () => {
    expect(lastPerformance([{ reps: 9 }, { reps: 9 }, { reps: 8 }], { bodyweight: true })).toEqual({
      load: 0,
      reps: [9, 9, 8],
    })
  })

  it('progresses from belt sets when some were weighted', () => {
    expect(lastPerformance([{ load: 10, reps: 6 }, { reps: 12 }], { bodyweight: true })).toEqual({
      load: 10,
      reps: [6],
    })
  })

  it('still ignores unloaded sets on a loaded exercise', () => {
    expect(lastPerformance([{ reps: 9 }])).toBeUndefined()
  })
})
