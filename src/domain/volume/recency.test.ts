import { describe, expect, it } from 'vitest'

import type { VolumeMap } from './accounting'
import { emptyVolumeMap } from './landmarks'
import { freshnessOf, muscleRecency } from './recency'

const day = (date: string, sets: Partial<VolumeMap>) => ({
  date,
  volume: { ...emptyVolumeMap(), ...sets },
})

const TODAY = '2026-10-05' // a Monday

describe('how recently each muscle was trained', () => {
  const recency = muscleRecency(
    [
      day('2026-10-04', { quads: 4 }),
      day('2026-10-02', { chest: 3, quads: 2 }),
      day('2026-09-20', { lats: 3 }),
      day('2026-10-06', { biceps: 9 }),
    ],
    TODAY,
  )

  /* The point of it: the week card reset on Monday and Sunday still counts. */
  it('reads a Sunday session as yesterday on a Monday', () => {
    expect(recency.quads).toEqual({
      lastDay: '2026-10-04',
      daysAgo: 1,
      sets: 6,
      freshness: 'worked',
    })
  })

  it('counts sets only inside the last seven days, but remembers older days', () => {
    expect(recency.lats).toMatchObject({ daysAgo: 15, sets: 0, freshness: 'fresh' })
  })

  it('calls a muscle never trained fresh, with nothing claimed about when', () => {
    expect(recency.calves).toEqual({ sets: 0, freshness: 'fresh' })
  })

  it('ignores a day after today', () => {
    expect(recency.biceps.lastDay).toBeUndefined()
  })

  it('bands days since into worked, recovering and fresh', () => {
    expect([0, 1, 2, 3, 4].map(freshnessOf)).toEqual([
      'worked',
      'worked',
      'recovering',
      'recovering',
      'fresh',
    ])
    expect(recency.chest.freshness).toBe('recovering')
  })
})
