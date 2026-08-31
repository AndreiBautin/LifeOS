import { describe, expect, it } from 'vitest'

import { DEFAULT_DIGEST, parseDigestPreferences, rankDigest } from './digest'
import { readDevTo, readHackerNews, type Story } from './story'

/*
 * The fixtures are shapes taken from the live APIs on the day this was
 * written, trimmed to the fields that are read. Every quirk asserted
 * below was observed rather than imagined.
 */
const HN_PAYLOAD = {
  hits: [
    {
      objectID: '49503601',
      title: '“I just chose words carefully”',
      url: 'https://unsung.aresluna.org/i-just-chose-words-carefully/',
      points: 1104,
      num_comments: 310,
      created_at: '2026-08-30T22:49:48Z',
      _tags: ['story', 'author_zdw', 'story_49503601', 'front_page'],
      // Present on every real hit, and the reason parsing exists: this
      // is eighty comment ids on the story that produced this fixture.
      children: [49503733, 49503754, 49503779],
      _highlightResult: { title: { value: 'x', matchLevel: 'none' } },
    },
    {
      objectID: '49500000',
      title: 'Ask HN: how do you review TypeScript?',
      // Null on a real Ask HN, where the discussion *is* the story.
      url: null,
      points: 88,
      num_comments: 41,
      created_at: '2026-08-30T10:00:00Z',
      _tags: ['story', 'ask_hn', 'front_page'],
    },
    // A comment rather than a story: no title, nothing to show.
    { objectID: '49500001', points: 3, num_comments: 0 },
  ],
}

const DEV_PAYLOAD = [
  {
    id: 2860000,
    title: '10 Git Commands You’ll Wish You Knew Earlier',
    url: 'https://dev.to/sylwia-lask/10-git-commands-4fcp',
    positive_reactions_count: 240,
    public_reactions_count: 240,
    comments_count: 96,
    published_at: '2026-08-26T07:59:06Z',
    tag_list: ['git', 'programming', 'productivity', 'beginners'],
  },
]

describe('reading Hacker News', () => {
  it('keeps the handful of fields a card needs', () => {
    const [first] = readHackerNews(HN_PAYLOAD)

    expect(first?.title).toBe('“I just chose words carefully”')
    expect(first?.points).toBe(1104)
    expect(first?.comments).toBe(310)
    expect(first?.url).toBe('https://unsung.aresluna.org/i-just-chose-words-carefully/')
  })

  /*
   * A single real hit carries `_highlightResult` and every comment id on
   * the story. Keeping raw hits would put tens of kilobytes of comment
   * ids into a cache that exists to hold thirty headlines.
   */
  it('drops the bookkeeping the API sends with each hit', () => {
    const [first] = readHackerNews(HN_PAYLOAD)

    expect(first).not.toHaveProperty('children')
    expect(first).not.toHaveProperty('_highlightResult')
  })

  /*
   * Observed on the live API. A card that assumed a link would render a
   * dead one for every Ask HN on the front page.
   */
  it('leaves the link absent on an Ask HN and still offers the discussion', () => {
    const ask = readHackerNews(HN_PAYLOAD).find((one) => one.title.startsWith('Ask HN'))

    expect(ask?.url).toBeUndefined()
    expect(ask?.discussionUrl).toBe('https://news.ycombinator.com/item?id=49500000')
  })

  it('always has a discussion to point at', () => {
    for (const story of readHackerNews(HN_PAYLOAD)) {
      expect(story.discussionUrl).toContain('news.ycombinator.com')
    }
  })

  it('skips a hit with no title, which is a comment', () => {
    expect(readHackerNews(HN_PAYLOAD)).toHaveLength(2)
  })

  /*
   * `_tags` carries `story`, `front_page` and `author_<name>` alongside
   * real topics, and none of the three is something anybody would set as
   * an interest.
   */
  it('keeps topic tags and drops the bookkeeping ones', () => {
    const ask = readHackerNews(HN_PAYLOAD).find((one) => one.title.startsWith('Ask HN'))

    expect(ask?.tags).toEqual(['ask_hn'])
  })

  it('says nothing about a payload of the wrong shape', () => {
    expect(readHackerNews(undefined)).toEqual([])
    expect(readHackerNews({ hits: 'not an array' })).toEqual([])
    expect(readHackerNews([])).toEqual([])
  })
})

describe('reading DEV', () => {
  it('reads a bare array rather than an envelope', () => {
    const [first] = readDevTo(DEV_PAYLOAD)

    expect(first?.title).toBe('10 Git Commands You’ll Wish You Knew Earlier')
    expect(first?.points).toBe(240)
    expect(first?.tags).toContain('git')
  })

  it('points the discussion at the article, which is where the comments are', () => {
    const [first] = readDevTo(DEV_PAYLOAD)

    expect(first?.discussionUrl).toBe(first?.url)
  })

  /*
   * `tag_list` is an array on this endpoint and a comma-separated string
   * on others in the same API. A digest that silently lost every tag
   * would rank on titles alone and nobody would know why.
   */
  it('reads tags whether they arrive as a list or a string', () => {
    const asString = readDevTo([{ ...DEV_PAYLOAD[0], tag_list: 'rust, wasm' }])

    expect(asString[0]?.tags).toEqual(['rust', 'wasm'])
  })

  it('ids are unique across sources', () => {
    const [hn] = readHackerNews(HN_PAYLOAD)
    const [dev] = readDevTo(DEV_PAYLOAD)

    expect(hn?.id.startsWith('hacker-news:')).toBe(true)
    expect(dev?.id.startsWith('dev-to:')).toBe(true)
  })
})

function story(title: string, points: number, tags: readonly string[] = []): Story {
  return {
    id: title,
    title,
    source: 'hacker-news',
    discussionUrl: 'https://example.test',
    points,
    comments: 0,
    at: '2026-08-31T09:00:00Z',
    tags,
  }
}

describe('ranking the digest', () => {
  /*
   * The one place the job scorer's shape was deliberately not copied.
   * There a keyword is a *share* of the wanted list, so adding one you
   * rarely match lowers every score. A digest has no such excuse: hiding
   * everything off-subject turns it into a filter bubble somebody
   * configured by accident.
   */
  it('floats an interest to the top without hiding anything else', () => {
    const ranked = rankDigest(
      [story('A big story about nothing', 900), story('A small TypeScript story', 60)],
      { ...DEFAULT_DIGEST, interests: ['typescript'], minimumPoints: 0 },
    )

    expect(ranked[0]?.story.title).toBe('A small TypeScript story')
    expect(ranked).toHaveLength(2)
  })

  it('matches an interest on a tag as well as a title', () => {
    const ranked = rankDigest([story('Untitled', 10, ['rust'])], {
      ...DEFAULT_DIGEST,
      interests: ['rust'],
      minimumPoints: 0,
    })

    expect(ranked[0]?.hits).toBe(1)
  })

  it('ranks more interests above fewer', () => {
    const ranked = rankDigest(
      [story('Rust', 900, ['rust']), story('Rust and WASM together', 10, ['rust', 'wasm'])],
      { ...DEFAULT_DIGEST, interests: ['rust', 'wasm'], minimumPoints: 0 },
    )

    expect(ranked[0]?.hits).toBe(2)
  })

  it('falls back to the source’s own points, never a score of ours', () => {
    const ranked = rankDigest([story('Quiet', 10), story('Loud', 900)], {
      ...DEFAULT_DIGEST,
      minimumPoints: 0,
    })

    expect(ranked.map((one) => one.story.title)).toEqual(['Loud', 'Quiet'])
  })

  it('drops a muted subject outright, which is what a mute is', () => {
    const ranked = rankDigest([story('All about crypto', 900), story('Something else', 10)], {
      ...DEFAULT_DIGEST,
      mutes: ['crypto'],
      minimumPoints: 0,
    })

    expect(ranked.map((one) => one.story.title)).toEqual(['Something else'])
  })

  it('applies the points floor', () => {
    const ranked = rankDigest([story('Quiet', 10), story('Loud', 900)], {
      ...DEFAULT_DIGEST,
      minimumPoints: 100,
    })

    expect(ranked).toHaveLength(1)
  })

  /*
   * The whole claim of a digest is that it ends. A list that scrolls is
   * a feed, which is the failure mode this feature has to stay the right
   * side of.
   */
  it('ends, rather than scrolling', () => {
    const many = Array.from({ length: 40 }, (_unused, index) =>
      story(`Story ${String(index)}`, 100),
    )

    expect(rankDigest(many, { ...DEFAULT_DIGEST, limit: 5 })).toHaveLength(5)
  })
})

describe('reading stored preferences back', () => {
  it('survives a blob that is not an object', () => {
    expect(parseDigestPreferences('nonsense')).toEqual(DEFAULT_DIGEST)
  })

  it('keeps sources it recognises and drops the rest', () => {
    const parsed = parseDigestPreferences({ sources: ['hacker-news', 'reddit'] })

    expect(parsed.sources).toEqual(['hacker-news'])
  })

  /*
   * A stored zero would produce an empty digest every morning with
   * nothing on any screen able to say why.
   */
  it('never lets the limit reach zero', () => {
    expect(parseDigestPreferences({ limit: 0 }).limit).toBe(1)
    expect(parseDigestPreferences({ limit: 5000 }).limit).toBe(50)
  })

  it('clamps a nonsense points floor rather than trusting it', () => {
    expect(parseDigestPreferences({ minimumPoints: -20 }).minimumPoints).toBe(0)
  })
})
