import { describe, expect, it } from 'vitest'

import { asExerciseId, type ExerciseId } from '@/domain/ids/ids'

import { migrateBenchEstimate, withDerivedMaxes } from './derived-maxes'

const TOUCH_AND_GO = asExerciseId('bench-press')
const PAUSED = asExerciseId('paused-bench-press')
const CLOSE = asExerciseId('close-grip-bench-press')

const maxes = (entries: Partial<Record<ExerciseId, number>>) => withDerivedMaxes(entries)

describe('estimating a variation nobody has measured', () => {
  it('derives the bench variations from the competition bench', () => {
    // Touch-and-go is *heavier* than the paused version: no pause means
    // no loss of the stretch reflex, so its factor is above one.
    const derived = maxes({ [PAUSED]: 300 })

    expect(derived[TOUCH_AND_GO]).toBe(315)
    expect(derived[CLOSE]).toBe(285)
  })

  it('never overrides a measured estimate', () => {
    /*
     * The whole reason this is safe. A number off a bar beats a number off
     * a ratio, and a derived value that kept winning would be the training
     * max mistake wearing a new coat — a figure the app maintains, quietly
     * disagreeing with what the lifter actually did.
     */
    const derived = maxes({ [PAUSED]: 300, [CLOSE]: 255 })

    expect(derived[CLOSE]).toBe(255)
  })

  it('derives nothing when the parent lift has no estimate', () => {
    // A ratio of an unknown is not a better guess than no guess. An RPE
    // set is performable without a suggestion; a wrong one is not free.
    expect(withDerivedMaxes({})).toEqual({})
  })

  it('leaves the object identical when there is nothing to add', () => {
    // By identity, so React does not re-render for a copy of the same
    // numbers on every settings read.
    const original = { [PAUSED]: 300, [TOUCH_AND_GO]: 315, [CLOSE]: 285 }

    expect(withDerivedMaxes(original)).toBe(original)
  })

  it('does not touch unrelated lifts', () => {
    const squat = asExerciseId('low-bar-squat')
    const derived = maxes({ [squat]: 405 })

    expect(derived).toEqual({ [squat]: 405 })
  })
})

describe('moving a bench estimate when the competition lift changed', () => {
  it('discounts the old number rather than copying it across', () => {
    /*
     * `bench-press` used to be the competition lift and is now the
     * touch-and-go variation, so a stored estimate under that slug was
     * measured on a bar with no pause whatever it was called at the time.
     * Copying it verbatim would credit a paused max nobody has pressed.
     */
    const moved = migrateBenchEstimate({ [TOUCH_AND_GO]: 300 })

    expect(moved[PAUSED]).toBe(285)
    expect(moved[TOUCH_AND_GO]).toBe(300)
  })

  it('leaves a paused estimate that already exists alone', () => {
    // Idempotent, and — more importantly — it never overwrites a
    // correction. Running twice must not compound the discount.
    const once = migrateBenchEstimate({ [TOUCH_AND_GO]: 300 })
    const twice = migrateBenchEstimate(once)

    expect(twice[PAUSED]).toBe(285)
    expect(migrateBenchEstimate({ [TOUCH_AND_GO]: 300, [PAUSED]: 260 })[PAUSED]).toBe(260)
  })

  it('does nothing when there was no bench estimate to move', () => {
    expect(migrateBenchEstimate({})).toEqual({})
  })

  it('does not touch unrelated lifts', () => {
    const squat = asExerciseId('low-bar-squat')
    const derived = maxes({ [squat]: 405 })

    expect(derived).toEqual({ [squat]: 405 })
  })
})
