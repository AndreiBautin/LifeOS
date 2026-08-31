/**
 * A story in the morning digest, and the parsing that gets it there.
 *
 * **Pure, like the job boards' parsing.** Nothing here touches the
 * network; `infrastructure/news/news-gateway.ts` is the only thing that
 * fetches, which is what makes every quirk below testable against a
 * fixture rather than against the internet on the day the suite runs.
 * The fixtures are shapes taken from the live APIs rather than invented.
 *
 * **This area pays no XP and is not a `LifeArea`.** A digest is the one
 * thing in the hub that is not a record of anything you did — reading a
 * headline list is not an act, and paying for marking items read would
 * create exactly the farming incentive the act/outcome line exists to
 * prevent. It is a reading surface, like the map's tiles.
 *
 * What it *does* have is one action that lands in an area which already
 * scores: saving a story to the Codex. Logging progress there pays, and
 * finishing it pays, and both feed Intellect. So the honest path from
 * "this looks interesting" to XP goes through a record of having
 * actually read the thing.
 */

export const NEWS_SOURCES = ['hacker-news', 'dev-to'] as const

export type NewsSource = (typeof NEWS_SOURCES)[number]

export const SOURCE_LABELS: Record<NewsSource, string> = {
  'hacker-news': 'Hacker News',
  'dev-to': 'DEV',
}

export interface Story {
  /** Unique within a source; prefixed with it to be unique across them. */
  readonly id: string
  readonly title: string
  readonly source: NewsSource
  /**
   * Where the story itself lives.
   *
   * Absent for an Ask HN or a Show HN with no link, where the discussion
   * *is* the story — verified against the live API, which returns a null
   * `url` for those. A card that assumed a link would render a dead one.
   */
  readonly url?: string
  /** The discussion, which always exists even when `url` does not. */
  readonly discussionUrl: string
  readonly points: number
  readonly comments: number
  /** ISO, from the source. */
  readonly at: string
  readonly tags: readonly string[]
}

/**
 * The fields kept, out of the sixty each API sends.
 *
 * Worth naming because the discarded ones are not merely unused. A
 * single Algolia hit carries `_highlightResult` and a `children` array
 * of every comment id on the story — eighty of them on the first one
 * looked at — so keeping raw hits would put tens of kilobytes of comment
 * ids into a cache that exists to hold thirty headlines.
 */
type Bag = Readonly<Record<string, unknown>>

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

/**
 * Hacker News, via Algolia's search API.
 *
 * Algolia rather than the official Firebase API, and the reason is the
 * request count: Firebase gives 500 story *ids* and then wants one
 * request per story to turn them into titles, where this returns the
 * whole front page in a single call. Both are open to a browser with no
 * key — both were tested — and thirty requests a morning against a free
 * service is the sort of thing the restraint elsewhere in this app
 * exists to avoid.
 */
export function readHackerNews(payload: unknown): readonly Story[] {
  const hits = (payload as Bag | undefined)?.hits

  if (!Array.isArray(hits)) return []

  return hits.flatMap((raw): readonly Story[] => {
    if (typeof raw !== 'object' || raw === null) return []

    const hit = raw as Bag
    const id = asString(hit.objectID)
    const title = asString(hit.title)

    // A hit with no title is a comment rather than a story, and there is
    // nothing to show for it.
    if (id === undefined || title === undefined) return []

    const url = asString(hit.url)

    return [
      {
        id: `hacker-news:${id}`,
        title,
        source: 'hacker-news',
        ...(url === undefined ? {} : { url }),
        discussionUrl: `https://news.ycombinator.com/item?id=${id}`,
        points: asCount(hit.points),
        comments: asCount(hit.num_comments),
        at: asString(hit.created_at) ?? '',
        /*
         * `_tags` carries bookkeeping as well as topics — `story`,
         * `front_page` and `author_<name>` are all in there — and none
         * of the three is something somebody would set as an interest.
         */
        tags: Array.isArray(hit._tags)
          ? hit._tags.filter(
              (tag): tag is string =>
                typeof tag === 'string' &&
                tag !== 'story' &&
                tag !== 'front_page' &&
                !tag.startsWith('author_') &&
                !tag.startsWith('story_'),
            )
          : [],
      },
    ]
  })
}

/**
 * DEV, which returns a bare array rather than an envelope.
 *
 * It sends both `public_reactions_count` and `positive_reactions_count`,
 * which agreed on every row looked at. The positive one is taken because
 * it is the figure the site itself displays.
 */
export function readDevTo(payload: unknown): readonly Story[] {
  if (!Array.isArray(payload)) return []

  return payload.flatMap((raw): readonly Story[] => {
    if (typeof raw !== 'object' || raw === null) return []

    const article = raw as Bag
    const id = article.id
    const title = asString(article.title)
    const url = asString(article.url)

    if (typeof id !== 'number' || title === undefined || url === undefined) return []

    return [
      {
        id: `dev-to:${String(id)}`,
        title,
        source: 'dev-to',
        url,
        // DEV has no separate discussion page; the article carries the
        // comments, so both point at the same place rather than one
        // being invented.
        discussionUrl: url,
        points: asCount(article.positive_reactions_count),
        comments: asCount(article.comments_count),
        at: asString(article.published_at) ?? '',
        /*
         * `tag_list` is an array on this endpoint and a comma-separated
         * string on others in the same API. Both are read, because a
         * digest that silently lost every tag would rank on titles alone
         * and nobody would know why.
         */
        tags: Array.isArray(article.tag_list)
          ? article.tag_list.filter((tag): tag is string => typeof tag === 'string')
          : typeof article.tag_list === 'string'
            ? article.tag_list
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag !== '')
            : [],
      },
    ]
  })
}
