import { describe, expect, it } from 'vitest'

import { asExerciseId, type ExerciseId } from '@/domain/ids/ids'

import { migrateBenchEstimate, withDerivedMaxes } from './derived-maxes'

const TOUCH_AND_GO = asExerciseId('bench-press')
const PAUSED = asExerciseId('paused-bench-press')
const CLOSE = asExerciseId('close-grip-bench-press')

const maxes = (entries: Partial<Record<ExerciseId, number>>) => withDerivedMaxes(entries)

describe('estimating a variation nobody has measured', () => {
  it('derives the touch-and-go bench from the competition bench', () => {
    // Touch-and-go is *heavier* than the paused version: no pause means
    // no loss of the stretch reflex, so its factor is above one.
    expect(maxes({ [PAUSED]: 300 })[TOUCH_AND_GO]).toBe(315)
  })

  /*
   * And the close grip is not derived at all any more. It left the bench
   * rotation when the bench dropped to two sessions, and a ratio for an
   * exercise no rotation reaches derives a max nothing ever loads.
   */
  it('does not derive a variation that left its rotation', () => {
    expect(maxes({ [PAUSED]: 300 })[CLOSE]).toBeUndefined()
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

  /*
   * The high bar squat used to be derived here and is not any more: it
   * left the squat's rotation when both lower days went to low bar, and a
   * hypertrophy exercise is loaded by RPE rather than from a max.
   * `conventional-deadlift` took its place as the variation with a ratio.
   */
  it('derives a conventional deadlift from the sumo one', () => {
    // Five per cent below for someone who competes sumo — a weaker claim
    // than the squat's was, since the gap between the two pulls is mostly
    // build. A starting position, replaced by the first top set logged.
    const sumo = asExerciseId('sumo-deadlift')

    expect(maxes({ [sumo]: 400 })[asExerciseId('conventional-deadlift')]).toBe(380)
  })

  it('leaves a measured conventional deadlift alone', () => {
    const sumo = asExerciseId('sumo-deadlift')
    const conventional = asExerciseId('conventional-deadlift')

    expect(maxes({ [sumo]: 400, [conventional]: 415 })[conventional]).toBe(415)
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
