import { describe, expect, it } from 'vitest'

import { CREDIT_BANDS, latest, toMonthKey } from './reading'
import { LEVELS, placeOnLadder } from '@/domain/game/character'

describe('the credit bands', () => {
  /*
   * The bands are the reason credit is a *ladder* rather than a rating —
   * a ladder must name an external standard, and FICO publishes these.
   * If the count ever stops matching the levels, a score lands on a rung
   * that does not exist.
   */
  it('has one threshold per level', () => {
    expect(CREDIT_BANDS).toHaveLength(LEVELS.length)
  })

  it('ascends, so a higher score never reads as a lower level', () => {
    expect([...CREDIT_BANDS]).toEqual([...CREDIT_BANDS].sort((a, b) => a - b))
  })

  it('places the published boundaries on the rungs they belong to', () => {
    expect(placeOnLadder(579, CREDIT_BANDS).level).toBe('Untrained')
    expect(placeOnLadder(580, CREDIT_BANDS).level).toBe('Novice')
    expect(placeOnLadder(700, CREDIT_BANDS).level).toBe('Intermediate')
    expect(placeOnLadder(740, CREDIT_BANDS).level).toBe('Advanced')
    expect(placeOnLadder(820, CREDIT_BANDS).level).toBe('Elite')
  })
})

describe('the latest figure of a kind', () => {
  /*
   * Per field, not per row. Somebody who checks their score quarterly
   * and their net worth monthly has months where one is present and the
   * other is not — and a "latest reading" that returned the newest *row*
   * would report the score as missing every month it was not checked.
   */
  it('skips months where that figure was not recorded', () => {
    const readings = [
      { month: '2026-06', creditScore: 700 },
      { month: '2026-07', netWorthMinor: 5 },
      { month: '2026-08', netWorthMinor: 6 },
    ]

    expect(latest(readings, 'creditScore')).toBe(700)
    expect(latest(readings, 'netWorthMinor')).toBe(6)
  })

  it('is absent rather than zero when nothing was ever recorded', () => {
    expect(latest([{ month: '2026-08', netWorthMinor: 1 }], 'creditScore')).toBeUndefined()
  })

  it('reads the months in order rather than the array', () => {
    const readings = [
      { month: '2026-08', creditScore: 800 },
      { month: '2026-06', creditScore: 600 },
    ]

    expect(latest(readings, 'creditScore')).toBe(800)
  })
})

describe('the month key', () => {
  /*
   * Local, like every other day and month key in this app. A UTC month
   * would roll over hours early on the last evening of every month for
   * anybody west of Greenwich, filing a figure under a month they had
   * not reached.
   */
  it('uses the month the person is in', () => {
    expect(toMonthKey(new Date('2026-09-01T02:00:00.000Z'))).toBe('2026-08')
  })
})
