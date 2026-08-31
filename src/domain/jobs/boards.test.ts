import { describe, expect, it } from 'vitest'

import { boardUrl, htmlToText, readBoard, UnknownBoard } from './boards'

/**
 * Reading the three boards.
 *
 * **The fixtures are shapes taken from the live APIs, not invented ones.**
 * Every oddity asserted below was found in the first posting looked at:
 * Greenhouse ids are numbers, its `content` is entity-encoded, and
 * Ashby's own `isRemote` said true on a role whose `workplaceType` was
 * Hybrid.
 */

describe('where each board lives', () => {
  it('escapes a token rather than pasting it into a URL', () => {
    expect(boardUrl('greenhouse', 'a b/c')).toContain('a%20b%2Fc')
  })
})

describe('Greenhouse', () => {
  const board = {
    jobs: [
      {
        id: 7532733,
        title: 'Account Executive, AI Sales',
        location: { name: 'San Francisco, CA' },
        content: '&lt;h2&gt;Who we are&lt;/h2&gt;&lt;p&gt;Stripe is a platform.&lt;/p&gt;',
        absolute_url: 'https://stripe.com/jobs/search?gh_jid=7532733',
        first_published: '2026-02-03T15:19:01-05:00',
        updated_at: '2026-08-25T17:40:40-04:00',
        departments: [{ id: 81430, name: 'Enterprise' }],
      },
    ],
  }

  it('reads a numeric id as a string, because everything downstream keys on one', () => {
    expect(readBoard('greenhouse', board, 'stripe')[0]?.externalId).toBe('7532733')
  })

  /*
   * `content` arrives entity-encoded, so one decode yields the markup and
   * the second yields the words. Stopping after one leaves `&lt;p&gt;`
   * in the text a keyword search then has to match through.
   */
  it('decodes twice, so the description is words rather than markup', () => {
    const description = readBoard('greenhouse', board, 'stripe')[0]?.description ?? ''

    expect(description).toContain('Stripe is a platform.')
    expect(description).not.toContain('<')
    expect(description).not.toContain('&lt;')
  })

  /*
   * `absolute_url` points at an embedded board on the company's own site
   * — verified against the live API, where Stripe's is a search page
   * with a query string. The hosted form is always at the canonical
   * address, and that is the one anything could ever fill.
   */
  it('builds the canonical apply URL rather than trusting absolute_url', () => {
    const posting = readBoard('greenhouse', board, 'stripe')[0]

    expect(posting?.url).toContain('stripe.com/jobs/search')
    expect(posting?.applyUrl).toBe('https://job-boards.greenhouse.io/stripe/jobs/7532733')
  })

  it('prefers when it was first published over when it was last touched', () => {
    expect(readBoard('greenhouse', board, 'stripe')[0]?.postedAt).toBe('2026-02-03T20:19:01.000Z')
  })

  it('takes the first named department', () => {
    expect(readBoard('greenhouse', board, 'stripe')[0]?.department).toBe('Enterprise')
  })

  it('reads remote out of the title when the location does not say it', () => {
    const remote = { jobs: [{ id: 1, title: 'Engineer (Remote)', location: { name: 'US' } }] }

    expect(readBoard('greenhouse', remote, 'x')[0]?.isRemote).toBe(true)
  })

  it('is empty for a board with no jobs rather than throwing', () => {
    expect(readBoard('greenhouse', { jobs: [] }, 'x')).toEqual([])
  })
})

describe('Lever', () => {
  const board = [
    {
      id: 'abc-123',
      text: 'Senior Software Engineer',
      categories: { location: 'Denver, CO', department: 'Engineering', team: 'Platform' },
      workplaceType: 'remote',
      descriptionPlain: 'Build things.',
      additionalPlain: 'Benefits are good.',
      hostedUrl: 'https://jobs.lever.co/acme/abc-123',
      createdAt: 1_756_000_000_000,
    },
  ]

  /*
   * An unknown token answers 200 with `{"ok":false,...}` rather than a
   * 404 — confirmed against the live API — so the shape of the body is
   * the only way to tell a real empty board from a name that does not
   * exist.
   */
  it('treats a non-array body as a board that does not exist', () => {
    expect(() => readBoard('lever', { ok: false, error: 'Document not found' }, 'nope')).toThrow(
      UnknownBoard,
    )
  })

  it('reads an empty array as a real board with nothing open', () => {
    expect(readBoard('lever', [], 'lever')).toEqual([])
  })

  it('joins the two description halves', () => {
    const description = readBoard('lever', board, 'acme')[0]?.description ?? ''

    expect(description).toContain('Build things.')
    expect(description).toContain('Benefits are good.')
  })

  it('builds an apply URL from the hosted one when the board omits it', () => {
    expect(readBoard('lever', board, 'acme')[0]?.applyUrl).toBe(
      'https://jobs.lever.co/acme/abc-123/apply',
    )
  })

  it('reads the epoch milliseconds Lever dates with', () => {
    expect(readBoard('lever', board, 'acme')[0]?.postedAt).toBe(
      new Date(1_756_000_000_000).toISOString(),
    )
  })
})

describe('Ashby', () => {
  /*
   * Taken from the live board, leading space and all: the first posting
   * looked at had `workplaceType: "Hybrid"` and `isRemote: true`, which
   * is the flag this parser exists to ignore.
   */
  const hybridButFlaggedRemote = {
    jobs: [
      {
        id: 'job-1',
        title: ' Security Engineer, Cloud',
        department: 'Security',
        location: 'New York, NY (HQ)',
        workplaceType: 'Hybrid',
        isRemote: true,
        isListed: true,
        publishedAt: '2026-04-07T17:12:35.753+00:00',
        jobUrl: 'https://jobs.ashbyhq.com/ramp/job-1',
        applyUrl: 'https://jobs.ashbyhq.com/ramp/job-1/application',
        descriptionPlain: 'Secure the cloud.',
        compensation: {
          scrapeableCompensationSalarySummary: '$211.4K - $290.6K',
          compensationTiers: [
            {
              components: [
                { compensationType: 'EquityPercentage', minValue: null, maxValue: null },
                {
                  compensationType: 'Salary',
                  minValue: 211400,
                  maxValue: 290600,
                  currencyCode: 'USD',
                },
              ],
            },
          ],
        },
      },
    ],
  }

  /**
   * The flag boards routinely set on office jobs. Trusting it floods a
   * remote search with roles that are not remote, which is the failure
   * this whole function exists to prevent.
   */
  it('ignores isRemote when workplaceType says otherwise', () => {
    expect(readBoard('ashby', hybridButFlaggedRemote, 'ramp')[0]?.isRemote).toBe(false)
  })

  it('reads the location only when workplaceType is silent', () => {
    const silent = {
      jobs: [{ id: '1', title: 'Engineer', location: 'Remote — US', descriptionPlain: '' }],
    }

    expect(readBoard('ashby', silent, 'x')[0]?.isRemote).toBe(true)
  })

  /*
   * A tier holds components of several kinds. Taking the first one
   * reports somebody's equity grant as their salary — and the live
   * fixture has exactly that ordering.
   */
  it('takes the salary component rather than the first one', () => {
    const posting = readBoard('ashby', hybridButFlaggedRemote, 'ramp')[0]

    expect(posting?.salaryMinMinor).toBe(211_400_00)
    expect(posting?.salaryMaxMinor).toBe(290_600_00)
    expect(posting?.salaryRaw).toBe('$211.4K - $290.6K')
  })

  it('trims a title the board left a space on', () => {
    expect(readBoard('ashby', hybridButFlaggedRemote, 'ramp')[0]?.title).toBe(
      'Security Engineer, Cloud',
    )
  })

  it('leaves out a posting the board has unlisted', () => {
    const unlisted = { jobs: [{ id: '1', title: 'Gone', isListed: false }] }

    expect(readBoard('ashby', unlisted, 'x')).toEqual([])
  })

  it('keeps the summary when no tier holds a salary', () => {
    const equityOnly = {
      jobs: [
        {
          id: '1',
          title: 'Engineer',
          compensation: {
            compensationTierSummary: 'Competitive',
            compensationTiers: [{ components: [{ compensationType: 'EquityPercentage' }] }],
          },
        },
      ],
    }

    const posting = readBoard('ashby', equityOnly, 'x')[0]
    expect(posting?.salaryRaw).toBe('Competitive')
    expect(posting?.salaryMinMinor).toBeUndefined()
  })
})

describe('turning description markup into words', () => {
  /*
   * Block tags become newlines first. Without that every list item runs
   * into the next, and the phrase matcher then invents pairs out of two
   * bullets that never touched.
   */
  it('breaks list items apart rather than running them together', () => {
    expect(htmlToText('<ul><li>Azure</li><li>Kubernetes</li></ul>')).toBe('Azure\n\nKubernetes')
  })

  it('decodes the entities a description carries', () => {
    expect(htmlToText('<p>R&amp;D &ndash; 5&#43; years</p>')).toBe('R&D – 5+ years')
  })

  it('is empty for empty markup rather than a string of whitespace', () => {
    expect(htmlToText('   ')).toBe('')
  })

  it('leaves an unknown entity alone rather than mangling it', () => {
    expect(htmlToText('<p>&notareal; thing</p>')).toContain('&notareal;')
  })
})
