import { describe, expect, it } from 'vitest'

import { asViceId } from '@/domain/ids/ids'

import { poolStanding, type ChargeReading, type Vice } from './charges'

function vice(over: Partial<Vice> = {}): Vice {
  return {
    id: asViceId('coffee'),
    name: 'Caffeine',
    capacity: 3,
    regenHours: 12,
    spent: [],
    createdAt: '2026-08-01T09:00:00.000Z',
    ...over,
  }
}

function reading(over: Partial<ChargeReading> = {}): ChargeReading {
  return { capacity: 3, available: 3, onCooldown: 0, over: 0, ...over }
}

describe('where a pool stands', () => {
  it('reads a limit through restraint', () => {
    expect(poolStanding(vice(), reading())).toBe('untouched')
    expect(poolStanding(vice(), reading({ available: 1 }))).toBe('holding')
    expect(poolStanding(vice(), reading({ available: 0 }))).toBe('spent')
    expect(poolStanding(vice(), reading({ available: 0, over: 2 }))).toBe('over')
  })

  /*
   * The half that reconciles the metaphor. Going out is a target, not a
   * limit — it is a flask you are filling rather than draining — and it
   * gets the vocabulary that deserves.
   */
  it('reads a target through progress', () => {
    const water = vice({ direction: 'target', name: 'Water' })

    expect(poolStanding(water, reading())).toBe('empty')
    expect(poolStanding(water, reading({ available: 1 }))).toBe('part-way')
    expect(poolStanding(water, reading({ available: 0 }))).toBe('full')
  })

  /*
   * A target is never "over". Reporting a fourth glass of water as
   * exceeding something would be scolding somebody for drinking enough,
   * which is exactly why `over` is a limit's word.
   */
  it('never reports a target as over, however much is logged', () => {
    const water = vice({ direction: 'target', name: 'Water' })

    expect(poolStanding(water, reading({ available: 0, over: 5 }))).toBe('full')
  })

  it('treats an absent direction as a limit, like everything written before targets existed', () => {
    expect(poolStanding(vice(), reading({ available: 0, over: 1 }))).toBe('over')
  })

  it('separates at-the-limit from past it', () => {
    expect(poolStanding(vice(), reading({ available: 0 }))).not.toBe(
      poolStanding(vice(), reading({ available: 0, over: 1 })),
    )
  })
})
