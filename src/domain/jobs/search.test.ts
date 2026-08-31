import { describe, expect, it } from 'vitest'

import {
  canSweep,
  EMPTY_JOB_SEARCH,
  formatSources,
  parseJobSearch,
  parseSources,
  withoutSource,
  withSource,
} from './search'

describe('parsing a pasted board list', () => {
  it('reads a kind and a slug off each line', () => {
    expect(parseSources('greenhouse:stripe\nlever:netflix')).toEqual([
      { provider: 'greenhouse', token: 'stripe' },
      { provider: 'lever', token: 'netflix' },
    ])
  })

  it('accepts commas as well as lines, because a paste is either', () => {
    expect(parseSources('greenhouse:stripe, ashby:ramp')).toHaveLength(2)
  })

  /*
   * Dropped rather than refused. This parses a paste, and rejecting the
   * whole list over one bad line is how somebody loses the nine good
   * ones they typed above it.
   */
  it('drops a line naming a board kind that does not exist', () => {
    expect(parseSources('workday:acme\ngreenhouse:stripe')).toEqual([
      { provider: 'greenhouse', token: 'stripe' },
    ])
  })

  it('drops a kind with no slug after it', () => {
    expect(parseSources('greenhouse:\ngreenhouse:stripe')).toHaveLength(1)
  })

  it('round-trips back to the text it came from', () => {
    const text = 'greenhouse:stripe\nlever:netflix'

    expect(formatSources(parseSources(text))).toBe(text)
  })
})

describe('following a board', () => {
  /*
   * A board can be followed once. Read twice, every posting on it
   * appears in the leads list beside itself — which reads as the boards
   * being broken rather than as the list being wrong.
   */
  it('does not follow the same board twice', () => {
    const once = withSource([], { provider: 'greenhouse', token: 'stripe' })
    const twice = withSource(once, { provider: 'greenhouse', token: 'stripe' })

    expect(twice).toHaveLength(1)
  })

  it('treats a differently-cased slug as the same board', () => {
    const once = withSource([], { provider: 'greenhouse', token: 'stripe' })

    expect(withSource(once, { provider: 'greenhouse', token: 'STRIPE' })).toHaveLength(1)
  })

  it('keeps the same slug on two different boards', () => {
    // A company can run a Greenhouse board and a Lever one, and the slug
    // is per-board — so these are two boards, not one typed twice.
    const once = withSource([], { provider: 'greenhouse', token: 'acme' })

    expect(withSource(once, { provider: 'lever', token: 'acme' })).toHaveLength(2)
  })

  it('ignores a blank slug rather than storing one', () => {
    expect(withSource([], { provider: 'greenhouse', token: '   ' })).toHaveLength(0)
  })

  it('unfollows by name whatever the casing', () => {
    const once = withSource([], { provider: 'greenhouse', token: 'stripe' })

    expect(withoutSource(once, { provider: 'greenhouse', token: 'Stripe' })).toEqual([])
  })
})

describe('whether the search can run', () => {
  it('needs somewhere to read from', () => {
    expect(canSweep(EMPTY_JOB_SEARCH)).toBe(false)
  })

  /*
   * A profile with no filters is a valid search: it scores everything on
   * the boards and ranks it. Only the boards are genuinely required, and
   * saying which is missing is what lets the screen explain itself.
   */
  it('does not need any filters', () => {
    expect(
      canSweep({ ...EMPTY_JOB_SEARCH, sources: [{ provider: 'lever', token: 'netflix' }] }),
    ).toBe(true)
  })
})

describe('reading a stored search back', () => {
  it('survives a blob that is not an object at all', () => {
    expect(parseJobSearch('nonsense')).toEqual(EMPTY_JOB_SEARCH)
    expect(parseJobSearch(null)).toEqual(EMPTY_JOB_SEARCH)
  })

  it('keeps what it recognises and drops what it does not', () => {
    const parsed = parseJobSearch({
      sources: [
        { provider: 'greenhouse', token: 'stripe' },
        { provider: 'workday', token: 'acme' },
        'not a source',
      ],
      profile: { titleIncludes: ['engineer', 7], remoteOnly: true },
    })

    expect(parsed.sources).toEqual([{ provider: 'greenhouse', token: 'stripe' }])
    expect(parsed.profile.titleIncludes).toEqual(['engineer'])
    expect(parsed.profile.remoteOnly).toBe(true)
  })

  /*
   * Absent, never zero — the rule the whole app follows. A stored blob
   * with no ceiling must come back with *no* ceiling, because
   * `maxAgeDays: 0` would reject every posting ever published.
   */
  it('leaves an unset ceiling absent rather than zero', () => {
    const parsed = parseJobSearch({ sources: [], profile: {} })

    expect(parsed.profile.maxAgeDays).toBeUndefined()
    expect(parsed.profile.minSalaryMinor).toBeUndefined()
    expect('maxAgeDays' in parsed.profile).toBe(false)
  })

  it('keeps a ceiling that was set', () => {
    const parsed = parseJobSearch({ profile: { maxAgeDays: 30, minSalaryMinor: 12_000_000 } })

    expect(parsed.profile.maxAgeDays).toBe(30)
    expect(parsed.profile.minSalaryMinor).toBe(12_000_000)
  })
})
