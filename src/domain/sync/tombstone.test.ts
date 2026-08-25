import { describe, expect, it } from 'vitest'

import { indexTombstones, shouldAccept, type Tombstone } from './tombstone'

/**
 * The failure these prevent is silent and it looks like success: a merge
 * reports records "added", which is what it says when it restores
 * something you deleted on purpose.
 */

function grave(id: string, deletedAt: string): Tombstone {
  return { id, collection: 'workouts', deletedAt }
}

const index = (tombstones: readonly Tombstone[]) => indexTombstones(tombstones)

describe('accepting an incoming record', () => {
  it('accepts anything that was never deleted', () => {
    const tombstones = index([grave('a', '2026-08-25T10:00:00.000Z')])

    expect(
      shouldAccept({ updatedAt: '2026-01-01T00:00:00.000Z' }, 'workouts', 'b', tombstones),
    ).toBe(true)
  })

  it('refuses a record that was deleted after it was last changed', () => {
    const tombstones = index([grave('a', '2026-08-25T10:00:00.000Z')])

    // The export happened before the deletion, so the file still carries
    // the session. This is the case that resurrects it.
    expect(
      shouldAccept({ updatedAt: '2026-08-25T09:00:00.000Z' }, 'workouts', 'a', tombstones),
    ).toBe(false)
  })

  it('accepts a record changed after the deletion', () => {
    const tombstones = index([grave('a', '2026-08-25T10:00:00.000Z')])

    // Deleted on the phone, edited on the desktop before they spoke. A
    // deletion describes the record as it stood, not every later version.
    expect(
      shouldAccept({ updatedAt: '2026-08-25T11:00:00.000Z' }, 'workouts', 'a', tombstones),
    ).toBe(true)
  })

  it('refuses a record that cannot say when it changed', () => {
    const tombstones = index([grave('a', '2026-08-25T10:00:00.000Z')])

    // Written before records carried a timestamp. It cannot prove it is
    // newer, and assuming it is undoes the deletion.
    expect(shouldAccept({}, 'workouts', 'a', tombstones)).toBe(false)
  })

  it('keeps collections apart', () => {
    const tombstones = index([
      { id: 'a', collection: 'exercises', deletedAt: '2026-08-25T10:00:00.000Z' },
    ])

    expect(
      shouldAccept({ updatedAt: '2026-08-25T09:00:00.000Z' }, 'workouts', 'a', tombstones),
    ).toBe(true)
    expect(
      shouldAccept({ updatedAt: '2026-08-25T09:00:00.000Z' }, 'exercises', 'a', tombstones),
    ).toBe(false)
  })

  it('takes the newest of two deletions of the same record', () => {
    const tombstones = index([
      grave('a', '2026-08-25T10:00:00.000Z'),
      grave('a', '2026-08-25T12:00:00.000Z'),
    ])

    // An edit between the two deletions does not survive the later one.
    expect(
      shouldAccept({ updatedAt: '2026-08-25T11:00:00.000Z' }, 'workouts', 'a', tombstones),
    ).toBe(false)
  })
})
