import { describe, expect, it } from 'vitest'

import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { canPair, pairWithNext, partnerOf, unpair } from './superset'

const accessory = (order: number) =>
  anEntry({ role: 'hypertrophy', order, sets: [aSet({ outcome: 'pending' })] })

describe('supersets', () => {
  const workout = aWorkout({
    entries: [anEntry({ role: 'strength', order: 0 }), accessory(1), accessory(2), accessory(3)],
  })

  it('pairs two accessories and finds each one from the other', () => {
    const paired = pairWithNext(workout, 1)
    expect(partnerOf(paired, 1)).toBe(2)
    expect(partnerOf(paired, 2)).toBe(1)
    expect(partnerOf(paired, 3)).toBeUndefined()
  })

  /* A competition lift wants its full rest. */
  it('will not pair a strength slot, or an entry already paired', () => {
    expect(canPair(workout.entries[0], workout.entries[1])).toBe(false)
    const paired = pairWithNext(workout, 1)
    expect(pairWithNext(paired, 2)).toBe(paired)
  })

  it('unpairs both halves at once', () => {
    const apart = unpair(pairWithNext(workout, 1), 2)
    expect(apart.entries.every((entry) => entry.superset === undefined)).toBe(true)
  })
})
