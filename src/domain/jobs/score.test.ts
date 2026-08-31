import { describe, expect, it } from 'vitest'

import { parseTerms, scorePosting, type Posting, type SearchProfile } from './score'

/**
 * The scorer, ported from Career Command Center.
 *
 * What is worth holding is the shape of the answer rather than the exact
 * numbers: which things drop a posting outright, which earn points, and
 * the one rule everybody trips over — that keyword score is a *share*,
 * so adding a keyword you rarely match lowers every score.
 */

const NOW = new Date('2026-08-31T12:00:00.000Z')

function posting(over: Partial<Posting> = {}): Posting {
  return {
    title: 'Senior Software Engineer',
    description: 'Build things with Azure and .NET.',
    location: 'Denver, CO',
    isRemote: false,
    ...over,
  }
}

function profile(over: Partial<SearchProfile> = {}): SearchProfile {
  return {
    titleIncludes: [],
    titleExcludes: [],
    keywordIncludes: [],
    keywordExcludes: [],
    locationIncludes: [],
    remoteOnly: false,
    ...over,
  }
}

describe('reading the terms somebody typed', () => {
  it('splits on newlines and commas so the field can stay a textarea', () => {
    expect(parseTerms('senior\nstaff, principal')).toEqual(['senior', 'staff', 'principal'])
  })

  it('folds case once, here, so no comparison downstream has to remember', () => {
    expect(parseTerms('Senior, SENIOR, senior')).toEqual(['senior'])
  })

  it('is empty for an empty field rather than a list holding nothing', () => {
    expect(parseTerms('  \n , ')).toEqual([])
  })
})

describe('the hard filters', () => {
  it('drops a blocked title term', () => {
    const result = scorePosting(
      posting({ title: 'Staff Engineer, Manager' }),
      profile({ titleExcludes: ['manager'] }),
      NOW,
    )

    expect(result.score).toBe(0)
    expect(result.rejected).toMatch(/manager/)
  })

  it('drops a blocked keyword found in the description', () => {
    const result = scorePosting(
      posting({ description: 'Occasional on-call rotation and clearance required' }),
      profile({ keywordExcludes: ['clearance'] }),
      NOW,
    )

    expect(result.rejected).toMatch(/clearance/)
  })

  it('drops a non-remote posting when remote-only is set', () => {
    expect(scorePosting(posting(), profile({ remoteOnly: true }), NOW).rejected).toBe('Not remote')
  })

  /*
   * The rule that looks like a bug and is not. "Remote Poland" is still
   * Poland, so a wanted-locations list is checked against remote
   * postings too — a bare `remote` term is how somebody opts into
   * remote-anywhere.
   */
  it('applies the location list to remote roles as well', () => {
    const remoteAbroad = posting({ isRemote: true, location: 'Remote — Poland' })

    expect(
      scorePosting(remoteAbroad, profile({ locationIncludes: ['denver'] }), NOW).rejected,
    ).toMatch(/not one of the wanted/)
  })

  it('lets a bare "remote" term opt into remote anywhere', () => {
    const remoteAbroad = posting({ isRemote: true, location: 'Remote — Poland' })

    expect(
      scorePosting(remoteAbroad, profile({ locationIncludes: ['remote'] }), NOW).rejected,
    ).toBeUndefined()
  })

  it('drops a posting older than the age limit', () => {
    const old = posting({ postedAt: '2026-06-01T00:00:00.000Z' })

    expect(scorePosting(old, profile({ maxAgeDays: 30 }), NOW).rejected).toMatch(
      /more than 30 days/,
    )
  })

  /*
   * Most boards do not publish pay, and dropping everything that stays
   * quiet about money would throw away the majority of the board to
   * enforce a floor nobody stated.
   */
  it('does not judge pay the board never published', () => {
    expect(
      scorePosting(posting(), profile({ minSalaryMinor: 200_000_00 }), NOW).rejected,
    ).toBeUndefined()
  })

  it('drops a published range whose top is below the floor', () => {
    const low = posting({ salaryMinMinor: 90_000_00, salaryMaxMinor: 110_000_00 })

    expect(scorePosting(low, profile({ minSalaryMinor: 150_000_00 }), NOW).rejected).toMatch(
      /below the minimum/,
    )
  })

  it('drops a posting whose title matches none of the wanted ones', () => {
    const result = scorePosting(posting(), profile({ titleIncludes: ['designer'] }), NOW)

    expect(result.rejected).toBe('Title matches none of the wanted titles')
  })
})

describe('what earns points', () => {
  it('gives a flat score when no title filter is set', () => {
    const result = scorePosting(posting(), profile(), NOW)

    expect(result.score).toBe(30)
    expect(result.reasons).toEqual([{ points: 30, text: 'no title filter set' }])
  })

  it('pays more for a second title hit, up to a ceiling', () => {
    const one = scorePosting(posting(), profile({ titleIncludes: ['engineer'] }), NOW)
    const two = scorePosting(posting(), profile({ titleIncludes: ['engineer', 'senior'] }), NOW)
    const three = scorePosting(
      posting(),
      profile({ titleIncludes: ['engineer', 'senior', 'software'] }),
      NOW,
    )

    expect(one.score).toBe(50)
    expect(two.score).toBe(55)
    expect(three.score).toBe(60)
  })

  /*
   * The single most surprising thing about this scorer, and it is
   * deliberate: keyword score is a share of the list, so a keyword you
   * rarely match lowers every score. The list ranks; it does not widen.
   */
  it('scores keywords as a share, so adding one you miss lowers the score', () => {
    const narrow = scorePosting(posting(), profile({ keywordIncludes: ['azure'] }), NOW)
    const wide = scorePosting(
      posting(),
      profile({ keywordIncludes: ['azure', 'kubernetes', 'terraform', 'kafka'] }),
      NOW,
    )

    expect(narrow.score).toBeGreaterThan(wide.score)
  })

  it('says which keywords it found', () => {
    const result = scorePosting(
      posting(),
      profile({ keywordIncludes: ['azure', 'kubernetes'] }),
      NOW,
    )

    expect(result.reasons.some((one) => one.text.includes('1/2 keywords'))).toBe(true)
  })

  it('pays for remote, or for a location hit, but not both', () => {
    const remote = scorePosting(
      posting({ isRemote: true }),
      profile({ locationIncludes: ['denver'] }),
      NOW,
    )

    expect(remote.reasons.filter((one) => one.points === 10)).toHaveLength(1)
  })

  it('pays a little for publishing pay, and more for clearing the floor', () => {
    const result = scorePosting(
      posting({ salaryMinMinor: 180_000_00 }),
      profile({ minSalaryMinor: 150_000_00 }),
      NOW,
    )

    expect(result.reasons.map((one) => one.text)).toContain('pay published')
    expect(result.reasons.map((one) => one.text)).toContain('clears the minimum')
  })
})

describe('freshness', () => {
  it('pays for something posted this week', () => {
    const fresh = posting({ postedAt: '2026-08-28T12:00:00.000Z' })

    expect(scorePosting(fresh, profile(), NOW).reasons.some((one) => one.points === 5)).toBe(true)
  })

  /*
   * Penalised rather than dropped: a long-open req is often filled or
   * evergreen and occasionally still real, so it falls behind fresher
   * work instead of vanishing.
   */
  it('penalises a long-open req without dropping it', () => {
    const stale = posting({ postedAt: '2026-01-01T00:00:00.000Z' })

    const result = scorePosting(stale, profile(), NOW)

    expect(result.rejected).toBeUndefined()
    expect(result.reasons.some((one) => one.points === -8)).toBe(true)
    expect(result.score).toBe(22)
  })

  /*
   * The clock is a parameter for exactly this reason: read from the
   * system it would make every freshness assertion depend on the day the
   * suite runs, and the same posting would score differently tomorrow.
   */
  it('is judged against the clock it is given', () => {
    const fresh = posting({ postedAt: '2026-08-28T12:00:00.000Z' })
    const muchLater = new Date('2027-08-31T12:00:00.000Z')

    expect(scorePosting(fresh, profile(), muchLater).reasons.some((one) => one.points === -8)).toBe(
      true,
    )
  })

  it('says nothing about age when the board did not date it', () => {
    const result = scorePosting(posting(), profile(), NOW)

    expect(result.reasons.every((one) => !one.text.includes('posted'))).toBe(true)
  })
})

describe('the total', () => {
  it('never exceeds 100 or falls below 0', () => {
    const everything = posting({
      title: 'Senior Staff Software Engineer',
      isRemote: true,
      postedAt: '2026-08-30T12:00:00.000Z',
      salaryMinMinor: 200_000_00,
    })

    const result = scorePosting(
      everything,
      profile({
        titleIncludes: ['senior', 'staff', 'engineer', 'software'],
        keywordIncludes: ['azure'],
        minSalaryMinor: 150_000_00,
      }),
      NOW,
    )

    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it('adds up to exactly what its reasons say', () => {
    const result = scorePosting(
      posting({ isRemote: true, postedAt: '2026-08-29T12:00:00.000Z' }),
      profile({ titleIncludes: ['engineer'], keywordIncludes: ['azure', 'kubernetes'] }),
      NOW,
    )

    const summed = result.reasons.reduce((total, one) => total + one.points, 0)
    expect(result.score).toBe(summed)
  })
})
