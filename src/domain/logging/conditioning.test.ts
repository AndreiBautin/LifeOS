import { describe, expect, it } from 'vitest'

import { aSet, anEntry, aWorkout } from '@/test/builders/workout'

import { hasConditioning } from './workout-log'

/**
 * What feeds the Stamina trait.
 *
 * The interesting cases are all about *not* paying: a session with no
 * conditioning, and — the one that would be silently wrong — a session
 * where the conditioning was scheduled and then skipped.
 */
describe('hasConditioning', () => {
  it('is true when a conditioning set was completed', () => {
    const log = aWorkout({
      entries: [anEntry(), anEntry({ role: 'conditioning', order: 1, sets: [aSet()] })],
    })

    expect(hasConditioning(log)).toBe(true)
  })

  it('is false for a session that was only lifting', () => {
    expect(hasConditioning(aWorkout())).toBe(false)
  })

  /*
   * The one that would be wrong quietly. A conditioning row the
   * programme scheduled and the lifter skipped is a slot that existed,
   * not cardio that happened — and every session of the shipped
   * programme has one, so counting the slot would pay Stamina on every
   * lifting day whether or not anybody walked anywhere.
   */
  it('is false when the conditioning was skipped', () => {
    const log = aWorkout({
      entries: [anEntry({ role: 'conditioning', sets: [aSet({ outcome: 'skipped' })] })],
    })

    expect(hasConditioning(log)).toBe(false)
  })

  it('is false when the conditioning was never touched', () => {
    const log = aWorkout({
      entries: [anEntry({ role: 'conditioning', sets: [aSet({ outcome: 'pending' })] })],
    })

    expect(hasConditioning(log)).toBe(false)
  })

  /*
   * Asks *whether*, not how much: one act per session however long the
   * walk was. Flat rate is the rule every act in this app follows.
   */
  it('says nothing about how much was done', () => {
    const one = aWorkout({
      entries: [anEntry({ role: 'conditioning', sets: [aSet()] })],
    })
    const many = aWorkout({
      entries: [anEntry({ role: 'conditioning', sets: [aSet(), aSet(), aSet(), aSet()] })],
    })

    expect(hasConditioning(one)).toBe(hasConditioning(many))
  })
})
