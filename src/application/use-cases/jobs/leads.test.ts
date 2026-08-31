import { describe, expect, it } from 'vitest'

import { countByEmployer, sweepBoards, type LeadDeps } from './leads'
import { UnknownBoard, type AtsProvider, type FetchedPosting } from '@/domain/jobs/boards'
import type { SearchProfile } from '@/domain/jobs/score'

const NOW = new Date('2026-08-31T12:00:00.000Z')

function posting(over: Partial<FetchedPosting> = {}): FetchedPosting {
  return {
    externalId: '1',
    provider: 'greenhouse',
    boardToken: 'acme',
    title: 'Senior Software Engineer',
    description: 'Azure and .NET.',
    isRemote: true,
    url: 'https://example.test/1',
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

function deps(
  boards: Record<string, readonly FetchedPosting[] | Error>,
): LeadDeps & { readonly asked: string[] } {
  const asked: string[] = []

  return {
    asked,
    boards: {
      fetch: (provider: AtsProvider, token: string) => {
        asked.push(`${provider}:${token}`)
        const answer = boards[`${provider}:${token}`]
        if (answer instanceof Error) return Promise.reject(answer)
        return Promise.resolve(answer ?? [])
      },
    },
    clock: { now: () => NOW },
  }
}

describe('sweeping the boards', () => {
  it('keeps what clears the bar and drops what does not', async () => {
    const services = deps({
      'greenhouse:acme': [
        posting({ title: 'Senior Software Engineer' }),
        posting({ externalId: '2', title: 'Designer' }),
      ],
    })

    const sweep = await sweepBoards(
      [{ provider: 'greenhouse', token: 'acme' }],
      profile({ titleIncludes: ['engineer'] }),
      0,
      services,
    )

    expect(sweep.read).toBe(2)
    expect(sweep.leads.map((one) => one.posting.title)).toEqual(['Senior Software Engineer'])
  })

  it('orders the best first', async () => {
    const services = deps({
      'greenhouse:acme': [
        posting({ externalId: '1', title: 'Engineer', isRemote: false }),
        posting({ externalId: '2', title: 'Senior Engineer', isRemote: true }),
      ],
    })

    const sweep = await sweepBoards(
      [{ provider: 'greenhouse', token: 'acme' }],
      profile({ titleIncludes: ['engineer', 'senior'] }),
      0,
      services,
    )

    expect(sweep.leads[0]?.posting.title).toBe('Senior Engineer')
  })

  /*
   * A typo'd token is the commonest thing that goes wrong here. A sweep
   * that threw on the first bad board would report nothing at all and
   * leave somebody blaming the network.
   */
  it('names a board it could not read and keeps going', async () => {
    const services = deps({
      'greenhouse:typo': new UnknownBoard('greenhouse', 'typo'),
      'lever:acme': [posting({ provider: 'lever', boardToken: 'acme' })],
    })

    const sweep = await sweepBoards(
      [
        { provider: 'greenhouse', token: 'typo' },
        { provider: 'lever', token: 'acme' },
      ],
      profile(),
      0,
      services,
    )

    expect(sweep.leads).toHaveLength(1)
    expect(sweep.failures[0]?.reason).toContain('typo')
  })

  it('honours the minimum score', async () => {
    const services = deps({ 'greenhouse:acme': [posting({ isRemote: false })] })

    const sweep = await sweepBoards(
      [{ provider: 'greenhouse', token: 'acme' }],
      profile(),
      90,
      services,
    )

    expect(sweep.leads).toEqual([])
    expect(sweep.read).toBe(1)
  })

  /*
   * These are free services run for employers, not for us. A dozen
   * simultaneous requests from every device that opens the screen is how
   * a free API stops being one.
   */
  it('reads the boards one at a time, in the order given', async () => {
    const services = deps({ 'greenhouse:a': [], 'lever:b': [], 'ashby:c': [] })

    await sweepBoards(
      [
        { provider: 'greenhouse', token: 'a' },
        { provider: 'lever', token: 'b' },
        { provider: 'ashby', token: 'c' },
      ],
      profile(),
      0,
      services,
    )

    expect(services.asked).toEqual(['greenhouse:a', 'lever:b', 'ashby:c'])
  })

  it('reports nothing read when there are no sources', async () => {
    const sweep = await sweepBoards([], profile(), 0, deps({}))

    expect(sweep).toEqual({ leads: [], read: 0, failures: [] })
  })
})

describe('how much of a list is one employer', () => {
  /*
   * Boards post in bulk, so a handful of companies dominate. Thirty
   * applications quietly going to one place is the thing this makes
   * visible before it happens rather than after.
   */
  it('counts the openings each board contributed', async () => {
    const services = deps({
      'greenhouse:acme': [posting({ externalId: '1' }), posting({ externalId: '2' })],
      'lever:other': [posting({ externalId: '3', provider: 'lever', boardToken: 'other' })],
    })

    const sweep = await sweepBoards(
      [
        { provider: 'greenhouse', token: 'acme' },
        { provider: 'lever', token: 'other' },
      ],
      profile(),
      0,
      services,
    )

    const counts = countByEmployer(sweep.leads)
    expect(counts.get('acme')).toBe(2)
    expect(counts.get('other')).toBe(1)
  })
})
