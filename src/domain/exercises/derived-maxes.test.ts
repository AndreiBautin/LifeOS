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

  it('does not touch a lift with no variations', () => {
    // The squat used to serve as the unrelated lift here, which stopped
    // being true the moment it gained a high-bar rotation. The overhead
    // press is neither a key nor a parent in `VARIATION_OF`.
    const press = asExerciseId('overhead-press')
    const derived = maxes({ [press]: 155 })

    expect(derived).toEqual({ [press]: 155 })
  })

  it('derives a high bar squat from the low bar one', () => {
    // Low bar allows more for most people, so the factor is below one.
    // A starting position for the first session, not a claim — the first
    // top set logged against the slug replaces it.
    const lowBar = asExerciseId('low-bar-squat')

    expect(maxes({ [lowBar]: 400 })[asExerciseId('high-bar-squat')]).toBe(360)
  })

  it('leaves a measured high bar squat alone', () => {
    const lowBar = asExerciseId('low-bar-squat')
    const highBar = asExerciseId('high-bar-squat')

    expect(maxes({ [lowBar]: 400, [highBar]: 385 })[highBar]).toBe(385)
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

  it('does not touch lifts that are not the bench', () => {
    // This was a duplicate of the derivation test above, in the wrong
    // block and calling the wrong function. The migration's own property
    // is that it moves one estimate and nothing else.
    const squat = asExerciseId('low-bar-squat')

    expect(migrateBenchEstimate({ [squat]: 405 })).toEqual({ [squat]: 405 })
  })
})
