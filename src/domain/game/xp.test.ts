import { describe, expect, it } from 'vitest'

import { XP_PER_SESSION, XP_PER_SET } from './character'
import { pointsFor, standing, TRAINING_ACTS, xpFrom, type ActDefinition } from './xp'

const catalogue: readonly ActDefinition[] = [
  { id: 'a.did-thing', area: 'a', label: 'Did a thing', points: 10 },
  { id: 'a.did-other', area: 'a', label: 'Did another', points: 3 },
]

describe('pointsFor', () => {
  it('is zero for an act the catalogue does not know', () => {
    expect(pointsFor('a.from-a-newer-build', catalogue)).toBe(0)
  })
})

describe('xpFrom', () => {
  it('sums a tally against the catalogue', () => {
    expect(xpFrom({ 'a.did-thing': 4, 'a.did-other': 2 }, catalogue)).toBe(46)
  })

  /*
   * A tally row for something this build has never heard of is a record
   * written by the other device on a newer version. Ignoring it is right;
   * throwing would fail the whole sync batch over one row.
   */
  it('ignores tally rows with no matching act', () => {
    expect(xpFrom({ 'a.did-thing': 1, 'z.unknown': 900 }, catalogue)).toBe(10)
  })
})

/*
 * The numbers, not just the shape.
 *
 * Training's acts are the two the character sheet already pays for. If
 * these ever stop agreeing, the sheet and the hub are quietly telling a
 * lifter two different things a session is worth.
 */
describe('TRAINING_ACTS', () => {
  it('pays exactly what the character sheet pays', () => {
    expect(pointsFor('training.session-finished', TRAINING_ACTS)).toBe(XP_PER_SESSION)
    expect(pointsFor('training.working-set-logged', TRAINING_ACTS)).toBe(XP_PER_SET)
  })
})

describe('standing', () => {
  it('opens level one at zero rather than in debt', () => {
    expect(standing(0)).toEqual({ xp: 0, level: 1, into: 0, needed: 100 })
  })
})
