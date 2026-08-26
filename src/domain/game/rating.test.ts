import { describe, expect, it } from 'vitest'

import { isJudgement, RATING_DIRECTIONS, RATING_OUTCOMES } from './rating'

/*
 * Both of these are guards on a vocabulary rather than tests of logic.
 *
 * Phase 4 ports Dashboard's five evaluators onto these names. A sixth
 * outcome, or a renamed direction, is a translation layer between two
 * spellings of the same thing — and translation layers between enums are
 * where the off-by-one lives.
 */
describe('the rating vocabulary', () => {
  it('is Dashboard’s four outcomes, unchanged', () => {
    expect(RATING_OUTCOMES).toEqual(['improved', 'regressed', 'stagnant', 'insufficient-data'])
  })

  it('is Dashboard’s five strategies, unchanged', () => {
    expect(RATING_DIRECTIONS).toEqual([
      'increase',
      'decrease',
      'stay-above',
      'stay-below',
      'stay-within-range',
    ])
  })
})

describe('isJudgement', () => {
  /*
   * Not a bad month — the absence of a second data point. Rendering it as
   * a regression punishes somebody for having just started tracking.
   */
  it('does not treat missing data as a verdict', () => {
    expect(isJudgement('insufficient-data')).toBe(false)
    expect(isJudgement('stagnant')).toBe(true)
  })
})
