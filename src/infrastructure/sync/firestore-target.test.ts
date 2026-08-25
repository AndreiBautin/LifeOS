import { describe, expect, it } from 'vitest'

import { stripUndefined } from './firestore-target'

/**
 * Firestore rejects `undefined` as a field value and the domain uses it
 * everywhere for "no note, no bodyweight, no RPE recorded". Getting this
 * wrong fails a whole push with a message about one field, or — worse —
 * writes nulls and turns every unanswered RPE into an answered one.
 *
 * The rest of the target is a query builder over the Firestore SDK, and
 * is not tested here: a double for `getDocs` would assert that this file
 * calls the functions this file calls. What it actually depends on —
 * cursor precision — is tested in `domain/sync/cursor.test.ts`, where it
 * can be tested for real.
 */

describe('preparing a record for Firestore', () => {
  it('drops undefined fields instead of writing null', () => {
    // An absent optional field must read back absent. `null` is a value,
    // and under `exactOptionalPropertyTypes` the domain can tell.
    expect(stripUndefined({ a: 1, b: undefined })).toEqual({ a: 1 })
    expect('b' in stripUndefined({ a: 1, b: undefined })).toBe(false)
  })

  it('keeps null, which is a recorded answer rather than a missing one', () => {
    expect(stripUndefined({ a: null })).toEqual({ a: null })
  })

  it('reaches into nested records', () => {
    const workout = {
      id: 'w1',
      notes: undefined,
      entries: [{ exerciseId: 'squat', variant: undefined, sets: [{ rpe: undefined, reps: 5 }] }],
    }

    expect(stripUndefined(workout)).toEqual({
      id: 'w1',
      entries: [{ exerciseId: 'squat', sets: [{ reps: 5 }] }],
    })
  })

  it('leaves arrays as arrays', () => {
    // Treating an array as a plain object turns it into {0: …, 1: …},
    // which round-trips as an object and breaks every consumer.
    const result = stripUndefined({ sets: [1, 2, 3] })

    expect(Array.isArray(result.sets)).toBe(true)
    expect(result.sets).toEqual([1, 2, 3])
  })

  it('passes primitives through untouched', () => {
    expect(stripUndefined(5)).toBe(5)
    expect(stripUndefined('a')).toBe('a')
    expect(stripUndefined(null)).toBe(null)
  })
})
