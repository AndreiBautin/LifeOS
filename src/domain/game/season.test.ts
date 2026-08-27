import { describe, expect, it } from 'vitest'

import {
  compareSeasons,
  daysLeftIn,
  isInSeason,
  monthsIn,
  previousSeason,
  seasonLabel,
  seasonOf,
  seasonProgress,
} from './season'

/**
 * Winter is the whole reason this file has tests.
 *
 * Every other season sits inside one calendar year and is arithmetic
 * nobody could get wrong. Winter spans a boundary, is named for the year
 * it ends in, and is the season a December act belongs to — three chances
 * to file three months of somebody's progress under the wrong heading.
 */

describe('which season a date is in', () => {
  it('puts December in the winter named for the following year', () => {
    expect(seasonOf(new Date('2025-12-15T12:00:00'))).toEqual({ season: 'winter', year: 2026 })
  })

  it('puts January and February in the winter named for their own year', () => {
    expect(seasonOf(new Date('2026-01-04T12:00:00'))).toEqual({ season: 'winter', year: 2026 })
    expect(seasonOf(new Date('2026-02-28T12:00:00'))).toEqual({ season: 'winter', year: 2026 })
  })

  it('agrees that December and January are the same season', () => {
    const december = seasonOf(new Date('2025-12-31T12:00:00'))
    const january = seasonOf(new Date('2026-01-01T12:00:00'))

    expect(december).toEqual(january)
  })

  it('handles the seasons that do not cross a year', () => {
    expect(seasonOf(new Date('2026-03-01T12:00:00')).season).toBe('spring')
    expect(seasonOf(new Date('2026-07-04T12:00:00')).season).toBe('summer')
    expect(seasonOf(new Date('2026-11-30T12:00:00')).season).toBe('autumn')
  })
})

describe('the months a season covers', () => {
  it('reaches back into the previous year for winter', () => {
    expect(monthsIn({ season: 'winter', year: 2026 })).toEqual(['2025-12', '2026-01', '2026-02'])
  })

  it('stays inside its year otherwise', () => {
    expect(monthsIn({ season: 'summer', year: 2026 })).toEqual(['2026-06', '2026-07', '2026-08'])
  })

  it('knows whether a date falls in it', () => {
    const winter = { season: 'winter', year: 2026 } as const

    expect(isInSeason(winter, '2025-12-25')).toBe(true)
    expect(isInSeason(winter, '2026-02-01T09:00:00.000Z')).toBe(true)
    expect(isInSeason(winter, '2026-03-01')).toBe(false)
    // The winter a year earlier, which shares no month with this one.
    expect(isInSeason(winter, '2024-12-25')).toBe(false)
  })
})

describe('stepping backwards', () => {
  /*
   * Winter is first in the list, so the season before it is the *previous
   * year's* autumn. Getting this wrong would compare a season against one
   * that has not happened.
   */
  it('goes from winter back to the previous autumn', () => {
    expect(previousSeason({ season: 'winter', year: 2026 })).toEqual({
      season: 'autumn',
      year: 2025,
    })
  })

  it('stays within the year otherwise', () => {
    expect(previousSeason({ season: 'summer', year: 2026 })).toEqual({
      season: 'spring',
      year: 2026,
    })
  })

  it('orders seasons chronologically, which the id alone does not', () => {
    const autumn = { season: 'autumn', year: 2025 } as const
    const winter = { season: 'winter', year: 2026 } as const

    // Alphabetically 'autumn' < 'winter' and 2025 < 2026, so this one
    // happens to agree — the case that matters is within a year.
    expect(compareSeasons(autumn, winter)).toBeLessThan(0)
    expect(
      compareSeasons({ season: 'winter', year: 2026 }, { season: 'autumn', year: 2026 }),
    ).toBeLessThan(0)
  })
})

describe('how far through a season we are', () => {
  it('is nearly nothing on the first day', () => {
    const progress = seasonProgress(
      { season: 'summer', year: 2026 },
      new Date('2026-06-01T06:00:00Z'),
    )

    expect(progress).toBeGreaterThanOrEqual(0)
    expect(progress).toBeLessThan(0.02)
  })

  it('is about half way through the middle month', () => {
    const progress = seasonProgress(
      { season: 'summer', year: 2026 },
      new Date('2026-07-16T12:00:00Z'),
    )

    expect(progress).toBeGreaterThan(0.45)
    expect(progress).toBeLessThan(0.55)
  })

  /*
   * A key from the past has to render as a finished season rather than as
   * a number past the end of its own bar.
   */
  it('clamps to nothing before it starts and to all of it after it ends', () => {
    const summer = { season: 'summer', year: 2026 } as const

    expect(seasonProgress(summer, new Date('2026-01-01T00:00:00Z'))).toBe(0)
    expect(seasonProgress(summer, new Date('2027-01-01T00:00:00Z'))).toBe(1)
  })

  it('counts winter across the year boundary rather than restarting', () => {
    const winter = { season: 'winter', year: 2026 } as const

    const december = seasonProgress(winter, new Date('2025-12-16T12:00:00Z'))
    const january = seasonProgress(winter, new Date('2026-01-16T12:00:00Z'))

    expect(december).toBeGreaterThan(0)
    expect(january).toBeGreaterThan(december)
  })
})

describe('days left', () => {
  it('counts to the end of the last month', () => {
    // 2026-08-31 is the last day of summer, so one day remains.
    expect(daysLeftIn({ season: 'summer', year: 2026 }, new Date('2026-08-31T00:00:00Z'))).toBe(1)
  })

  it('is zero once the season is over', () => {
    expect(daysLeftIn({ season: 'summer', year: 2026 }, new Date('2026-09-05T00:00:00Z'))).toBe(0)
  })

  it('crosses the year boundary for winter', () => {
    // From mid-December to the end of February.
    const left = daysLeftIn({ season: 'winter', year: 2026 }, new Date('2025-12-16T00:00:00Z'))

    expect(left).toBeGreaterThan(70)
    expect(left).toBeLessThan(80)
  })
})

describe('what a season is called', () => {
  it('reads as somebody would say it', () => {
    expect(seasonLabel({ season: 'winter', year: 2026 })).toBe('Winter 2026')
  })
})
