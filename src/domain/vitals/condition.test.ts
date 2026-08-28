import { describe, expect, it } from 'vitest'

import { conditionFraction, NEUTRAL_READINESS } from './condition'
import { sessionAdjustmentFor, type ReadinessFactors } from '@/domain/autoregulation/check-in'

const all = (level: ReadinessFactors['sleep']): ReadinessFactors => ({
  sleep: level,
  nutrition: level,
  hydration: level,
  stress: level,
  motivation: level,
})

describe('the condition bar', () => {
  it('runs empty to full across the range of answers', () => {
    expect(conditionFraction(all('poor'))).toBe(0)
    expect(conditionFraction(NEUTRAL_READINESS)).toBe(0.5)
    expect(conditionFraction(all('good'))).toBe(1)
  })

  it('sits between the two when the answers are mixed', () => {
    const fraction = conditionFraction({ ...all('good'), sleep: 'poor', stress: 'poor' })

    expect(fraction).toBeGreaterThan(0.5)
    expect(fraction).toBeLessThan(1)
  })

  /*
   * The bar and the session adjustment read the same sum, which is the
   * reason `readinessScore` was extracted rather than copied. A bar that
   * disagreed with the adjustment it is supposed to explain would be
   * worse than no bar — so a low bar must never coincide with a session
   * left as programmed.
   */
  it('agrees with the session adjustment it explains', () => {
    expect(conditionFraction(all('poor'))).toBeLessThan(0.5)
    expect(sessionAdjustmentFor(all('poor')).setMultiplier).toBeLessThan(1)

    expect(conditionFraction(all('good'))).toBeGreaterThan(0.5)
    expect(sessionAdjustmentFor(all('good')).setMultiplier).toBeGreaterThan(1)

    expect(conditionFraction(NEUTRAL_READINESS)).toBe(0.5)
    expect(sessionAdjustmentFor(NEUTRAL_READINESS).setMultiplier).toBe(1)
  })
})
