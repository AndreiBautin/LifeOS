import { describe, expect, it } from 'vitest'

import { asExerciseId, type ExerciseId } from '@/domain/ids/ids'

import { withDerivedMaxes } from './derived-maxes'

const BENCH = asExerciseId('bench-press')
const PAUSED = asExerciseId('paused-bench-press')
const CLOSE = asExerciseId('close-grip-bench-press')

const maxes = (entries: Partial<Record<ExerciseId, number>>) => withDerivedMaxes(entries)

describe('estimating a variation nobody has measured', () => {
  it('derives the bench variations from the competition bench', () => {
    const derived = maxes({ [BENCH]: 300 })

    expect(derived[PAUSED]).toBe(285)
    expect(derived[CLOSE]).toBe(270)
  })

  it('never overrides a measured estimate', () => {
    /*
     * The whole reason this is safe. A number off a bar beats a number off
     * a ratio, and a derived value that kept winning would be the training
     * max mistake wearing a new coat — a figure the app maintains, quietly
     * disagreeing with what the lifter actually did.
     */
    const derived = maxes({ [BENCH]: 300, [CLOSE]: 255 })

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
    const original = { [BENCH]: 300, [PAUSED]: 285, [CLOSE]: 270 }

    expect(withDerivedMaxes(original)).toBe(original)
  })

  it('does not touch unrelated lifts', () => {
    const squat = asExerciseId('low-bar-squat')
    const derived = maxes({ [squat]: 405 })

    expect(derived).toEqual({ [squat]: 405 })
  })
})
