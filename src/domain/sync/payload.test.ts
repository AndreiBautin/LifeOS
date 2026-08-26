import { describe, expect, it } from 'vitest'

import { changedSince, deletedSince } from './payload'

/**
 * The bug these exist for shipped and was found in a gym.
 *
 * Two devices, neither holding a single session, both reported sending
 * ninety records and receiving nothing. The exercise library is derived,
 * so `all()` hands back the shipped catalogue alongside a lifter's own
 * entries — and with no watermark this sent every one of them. Because
 * exercise ids are slugs, identical on every install, each device then
 * overwrote the other's copies and skipped them on pull as its own
 * writes.
 */

const stamped = (updatedAt: string) => ({ updatedAt })
const shipped = {}

describe('choosing what to send', () => {
  it('never sends a record with no stamp, even on a first sync', () => {
    // The case that shipped. No watermark used to mean "send everything",
    // which for a derived library means the whole built-in catalogue.
    expect(changedSince([shipped, shipped], undefined)).toEqual([])
  })

  it('sends a lifter’s own records on a first sync', () => {
    const mine = stamped('2026-08-25T09:00:00.000Z')

    expect(changedSince([mine, shipped], undefined)).toEqual([mine])
  })

  it('sends only what changed after the watermark', () => {
    const older = stamped('2026-08-25T09:00:00.000Z')
    const newer = stamped('2026-08-25T11:00:00.000Z')

    expect(changedSince([older, newer], '2026-08-25T10:00:00.000Z')).toEqual([newer])
  })

  it('excludes a record stamped exactly at the watermark', () => {
    // The watermark is the instant the last exchange began, and anything
    // stamped at it was already included. Re-sending is harmless but the
    // count would never settle to zero, which is the signal a lifter
    // reads to know the sync is done.
    const at = stamped('2026-08-25T10:00:00.000Z')

    expect(changedSince([at], '2026-08-25T10:00:00.000Z')).toEqual([])
  })
})

describe('choosing which deletions to send', () => {
  it('sends every tombstone on a first sync', () => {
    /*
     * Unlike records, a tombstone with no watermark *should* all go. It
     * exists only because something was deleted here, so there is no
     * shipped-content equivalent to exclude — the analogous mistake would
     * be forgetting a deletion, not over-sharing one.
     */
    const graves = [
      { id: 'a', collection: 'workouts' as const, deletedAt: '2026-08-25T09:00:00.000Z' },
    ]

    expect(deletedSince(graves, undefined)).toEqual(graves)
  })

  it('sends only deletions after the watermark', () => {
    const early = {
      id: 'a',
      collection: 'workouts' as const,
      deletedAt: '2026-08-25T09:00:00.000Z',
    }
    const late = { id: 'b', collection: 'workouts' as const, deletedAt: '2026-08-25T11:00:00.000Z' }

    expect(deletedSince([early, late], '2026-08-25T10:00:00.000Z')).toEqual([late])
  })
})
