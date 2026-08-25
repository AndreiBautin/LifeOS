import { describe, expect, it } from 'vitest'

import { CURSOR_START, decodeCursor, encodeCursor, laterCursor } from './cursor'

describe('the sync cursor', () => {
  it('survives a round trip at full precision', () => {
    const position = { seconds: 1_787_000_000, nanoseconds: 123_456_789 }

    expect(decodeCursor(encodeCursor(position))).toEqual(position)
  })

  it('keeps two instants inside the same millisecond apart', () => {
    // The failure this exists to prevent: a cursor stored in milliseconds
    // reads one of these, advances past both, and the other is never
    // offered again — silently, because a strict `>` skips it.
    const first = { seconds: 100, nanoseconds: 1_000_000 }
    const second = { seconds: 100, nanoseconds: 1_000_400 }

    expect(encodeCursor(first)).not.toBe(encodeCursor(second))
  })

  it('starts at the beginning when there is nothing stored', () => {
    expect(decodeCursor(undefined)).toEqual(CURSOR_START)
  })

  it.each(['', 'nonsense', '-1.0', '1.-5', '1.1000000000', '1.2.3', 'NaN'])(
    'starts over rather than guessing at %o',
    (value) => {
      // Every malformed cursor resolves to "read everything again", which
      // is slow once. Guessing a position risks skipping records that
      // will never be offered a second time.
      expect(decodeCursor(value)).toEqual(CURSOR_START)
    },
  )

  it('reads a cursor with no fractional part', () => {
    expect(decodeCursor('42')).toEqual({ seconds: 42, nanoseconds: 0 })
  })

  it('sorts as text the same way it orders as a position', () => {
    const early = encodeCursor({ seconds: 100, nanoseconds: 5 })
    const late = encodeCursor({ seconds: 100, nanoseconds: 40 })

    expect(early < late).toBe(true)
  })

  it('only ever moves forward', () => {
    const early = { seconds: 100, nanoseconds: 5 }
    const late = { seconds: 100, nanoseconds: 40 }

    expect(laterCursor(early, late)).toEqual(late)
    expect(laterCursor(late, early)).toEqual(late)
    expect(laterCursor({ seconds: 101, nanoseconds: 0 }, late)).toEqual({
      seconds: 101,
      nanoseconds: 0,
    })
  })
})
