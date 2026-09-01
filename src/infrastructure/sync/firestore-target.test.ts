import { describe, expect, it } from 'vitest'

import { EMPTY_PAYLOAD, type SyncPayload } from '@/domain/sync/payload'
import { pushOperations, stripUndefined } from './firestore-target'

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

/**
 * Which records go up, and under what key.
 *
 * `pushOperations` is pure so this can be tested for real rather than
 * against a double. It is worth testing because it was wrong: twelve
 * collections were pulled from the server and pushed to it by nothing,
 * and because `pull` still returned them and `isEmpty` still counted
 * them, a sync carrying only a habit tick or a weigh-in uploaded
 * nothing and reported success.
 */

/** Every field of the payload that holds a list, taken from the type. */
function listFields(): readonly string[] {
  return Object.entries(EMPTY_PAYLOAD)
    .filter(([, value]) => Array.isArray(value))
    .map(([key]) => key)
}

/** The field each collection is keyed by; anything unnamed uses `id`. */
const KEYED_BY_FIELD: Readonly<Record<string, string>> = {
  reviews: 'month',
  finance: 'month',
  weighIns: 'day',
}

/** One plausible record in every collection, keyed the way it is stored. */
function fullPayload(): SyncPayload {
  const filled: Record<string, unknown> = { ...EMPTY_PAYLOAD }

  for (const field of listFields()) {
    if (field === 'exploredCells') {
      filled[field] = ['u4pruyd']
      continue
    }

    if (field === 'tombstones') {
      filled[field] = [{ collection: 'workouts', id: 'w1', deletedAt: '2026-08-30T00:00:00.000Z' }]
      continue
    }

    filled[field] = [{ [KEYED_BY_FIELD[field] ?? 'id']: `${field}-1` }]
  }

  return filled as unknown as SyncPayload
}

describe('planning what a push writes', () => {
  it('sends every collection the payload can carry', () => {
    /*
     * The guard, and the one this file did not have. It is written
     * against the payload's own fields rather than a list repeated here,
     * because a hand-written copy of a list that already exists is
     * exactly what drifted — twice in `pull`, and permanently in `push`.
     */
    const operations = pushOperations(fullPayload(), 'device-a')
    const sent = new Set(operations.map((operation) => operation.path))

    expect([...listFields()].filter((field) => !sent.has(field))).toEqual([])
  })

  it('keys a weigh-in and a finance row by their date', () => {
    // Not `id`, which none of the three carries. Writing them under a
    // field they do not have files every one under the same key and
    // leaves a single document per collection.
    const operations = pushOperations(fullPayload(), 'device-a')
    const idFor = (path: string) => operations.find((one) => one.path === path)?.id

    expect(idFor('weighIns')).toBe('weighIns-1')
    expect(idFor('finance')).toBe('finance-1')
  })

  it('gives the fog one document per device rather than one for everybody', () => {
    // A shared document would let two devices overwrite each other's
    // walking, and a grow-only set that last-write-wins can erase is not
    // grow-only.
    const fog = pushOperations(fullPayload(), 'device-a').filter(
      (one) => one.path === 'exploredCells',
    )

    expect(fog).toEqual([{ path: 'exploredCells', id: 'device-a', record: { cells: ['u4pruyd'] } }])
  })

  it('writes both singletons under one id, so a second push overwrites', () => {
    const payload = {
      ...EMPTY_PAYLOAD,
      settings: { updatedAt: '2026-08-30T00:00:00.000Z' },
      resume: { updatedAt: '2026-08-30T00:00:00.000Z' },
    } as unknown as SyncPayload

    const ids = pushOperations(payload, 'device-a').map((one) => `${one.path}/${one.id}`)

    expect(ids).toEqual(['settings/current', 'resume/current'])
  })

  it('writes nothing at all for an empty payload', () => {
    // Including the fog: an empty set is not a walk worth a document,
    // and writing one every exchange would churn the other device's
    // pull for nothing.
    expect(pushOperations(EMPTY_PAYLOAD, 'device-a')).toEqual([])
  })
})
